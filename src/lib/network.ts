import { NextRequest } from 'next/server';

// Cached home WAN IP to detect router NAT hairpinning (when local devices use DoH/Secure DNS)
let cachedHomeWanIp: string | null = '143.159.84.9';
let lastWanCheck = 0;

export async function refreshHomeWanIp(): Promise<string | null> {
  const now = Date.now();
  if (cachedHomeWanIp && now - lastWanCheck < 300000) {
    return cachedHomeWanIp;
  }
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const data = await res.json();
      if (data?.ip) {
        cachedHomeWanIp = data.ip.trim();
        lastWanCheck = now;
        return cachedHomeWanIp;
      }
    }
  } catch {
    // Ignore fetch errors
  }
  return cachedHomeWanIp;
}

if (typeof process !== 'undefined') {
  refreshHomeWanIp().catch(() => {});
}

/**
 * Extracts the real client IP from incoming request headers
 * Handles reverse proxies like Cloudflare, GoDoxy, Nginx, Traefik, and standard proxies.
 */
export function getClientIp(req: Request | NextRequest): string {
  const headers = req.headers;

  // 1. Cloudflare connecting IP
  const cfIp = headers.get('cf-connecting-ip');
  if (cfIp && isValidIp(cfIp.trim())) {
    return cfIp.trim();
  }

  // 2. Standard X-Forwarded-For (first IP is the original client)
  const xForwardedFor = headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(',')[0].trim();
    if (isValidIp(firstIp)) {
      return firstIp;
    }
  }

  // 3. X-Real-IP
  const xRealIp = headers.get('x-real-ip');
  if (xRealIp && isValidIp(xRealIp.trim())) {
    return xRealIp.trim();
  }

  // 4. Fallback for NextRequest IP if available
  if ('ip' in req && typeof (req as any).ip === 'string') {
    const rawIp = (req as any).ip.trim();
    if (isValidIp(rawIp)) return rawIp;
  }

  return '127.0.0.1';
}

function isValidIp(ip: string): boolean {
  if (!ip) return false;
  // Basic IPv4 or IPv6 pattern
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || ip.includes(':');
}

/**
 * Checks whether an IP address belongs to local private networks or Tailscale.
 * - Local IPv4: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16
 * - Local IPv6: ::1, fe80::/10, fc00::/7
 * - Tailscale IPv4: 100.64.0.0/10 (100.64.0.0 - 100.127.255.255 CGNAT range used by Tailscale)
 * - Tailscale IPv6: fd7a:115c:a1e0::/48
 */
export function isLocalOrTailscaleIp(ip: string): boolean {
  if (!ip) return false;

  const cleanIp = ip.replace(/^::ffff:/, '').trim().toLowerCase();

  // Loopback
  if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') {
    return true;
  }

  // Home Router Public WAN IP / NAT Hairpinning
  // When local Wi-Fi devices (e.g. Brave, Firefox with DoH/Secure DNS) resolve public DNS,
  // packets hairpin through the home router, presenting the router's WAN IP to reverse proxies.
  const homePublicIp = process.env.HOME_PUBLIC_IP || cachedHomeWanIp || '143.159.84.9';
  if (cleanIp === homePublicIp || (cachedHomeWanIp && cleanIp === cachedHomeWanIp)) {
    return true;
  }

  // IPv4 Checks
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanIp)) {
    const parts = cleanIp.split('.').map(Number);
    const [p0, p1] = parts;

    // 10.0.0.0/8
    if (p0 === 10) return true;

    // 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;

    // 192.168.0.0/16
    if (p0 === 192 && p1 === 168) return true;

    // 169.254.0.0/16 (link-local)
    if (p0 === 169 && p1 === 254) return true;

    // Tailscale IPv4 CGNAT (100.64.0.0/10: 100.64.x.x to 100.127.x.x)
    if (p0 === 100 && p1 >= 64 && p1 <= 127) return true;

    return false;
  }

  // IPv6 Checks
  if (cleanIp.includes(':')) {
    // Tailscale IPv6 unique local range: fd7a:115c:a1e0::/48
    if (cleanIp.startsWith('fd7a:115c:a1e0') || cleanIp.startsWith('fd7a:')) {
      return true;
    }
    // Link-local IPv6: fe80::/10
    if (cleanIp.startsWith('fe80:')) {
      return true;
    }
    // Unique local IPv6: fc00::/7 (fc.. or fd..)
    if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether the request is originating from local network or Tailscale.
 * Also checks request Host for tailscale domains (*.ts.net) and Tailscale headers.
 */
export function isRequestLocalOrTailscale(req: Request | NextRequest): {
  isLocalOrTailscale: boolean;
  clientIp: string;
  reason?: string;
} {
  const clientIp = getClientIp(req);
  const headers = req.headers;

  // 1. Check IP address directly (Local, Tailscale, or Router NAT Hairpinning)
  if (isLocalOrTailscaleIp(clientIp)) {
    const isHairpin = clientIp === (process.env.HOME_PUBLIC_IP || cachedHomeWanIp || '143.159.84.9');
    return {
      isLocalOrTailscale: true,
      clientIp,
      reason: isHairpin
        ? 'Home Router NAT Hairpinning (Local Wi-Fi device using Secure DNS/DoH)'
        : 'IP match (Local or Tailscale CGNAT)',
    };
  }

  // 1b. Check all IPs in X-Forwarded-For chain
  const xForwardedFor = headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const allIps = xForwardedFor.split(',').map((s) => s.trim());
    for (const singleIp of allIps) {
      if (isLocalOrTailscaleIp(singleIp)) {
        return {
          isLocalOrTailscale: true,
          clientIp: singleIp,
          reason: 'X-Forwarded-For local/Tailscale match',
        };
      }
    }
  }

  // 2. Check Host / X-Forwarded-Host for Tailscale domains
  const host = (headers.get('x-forwarded-host') || headers.get('host') || '').toLowerCase();
  if (host.includes('.ts.net') || host.includes('.tailscale.net') || host.includes('tailscale')) {
    return {
      isLocalOrTailscale: true,
      clientIp,
      reason: 'Tailscale domain host',
    };
  }

  // 3. Tailscale Serve / Funnel header
  if (headers.get('tailscale-user-login') || headers.get('tailscale-user-name')) {
    return {
      isLocalOrTailscale: true,
      clientIp,
      reason: 'Tailscale header present',
    };
  }

  return {
    isLocalOrTailscale: false,
    clientIp,
    reason: 'Public external IP',
  };
}

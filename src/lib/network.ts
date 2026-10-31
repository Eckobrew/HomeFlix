import { NextRequest } from 'next/server';

function validIp(ip: string): boolean {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return ip.split('.').every(p => Number(p) <= 255);
  try { return ip.includes(':') && new URL(`http://[${ip}]/`).hostname.length > 0; } catch { return false; }
}

/** Forwarded addresses are trusted only behind an explicitly configured proxy. */
export function getClientIp(req: Request | NextRequest): string {
  if (process.env.HOMESTREAM_TRUST_PROXY === 'true') {
    const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('cf-connecting-ip')?.trim() || req.headers.get('x-real-ip')?.trim();
    if (forwarded && validIp(forwarded)) return forwarded;
  }
  if ('ip' in req && typeof req.ip === 'string' && validIp(req.ip)) return req.ip;
  return '';
}

export function isLocalOrTailscaleIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/i, '').toLowerCase();
  if (!validIp(clean)) return false;
  if (clean === '::1') return true;
  if (clean.includes(':')) return /^(fc|fd)/.test(clean) || /^fe[89ab]/.test(clean);
  const [a, b] = clean.split('.').map(Number);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

export function isRequestLocalOrTailscale(req: Request | NextRequest): { isLocalOrTailscale: boolean; clientIp: string; reason: string } {
  const clientIp = getClientIp(req);
  const trusted = isLocalOrTailscaleIp(clientIp);
  return { isLocalOrTailscale: trusted, clientIp, reason: trusted ? 'Trusted private client address' : 'Authentication required' };
}

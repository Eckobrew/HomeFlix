import { NextRequest, NextResponse } from 'next/server';
import { isRequestLocalOrTailscale } from '@/lib/network';
import { getServerConfig } from '@/lib/config';
import { JellyfinClient } from '@/lib/jellyfin';

export const dynamic = 'force-dynamic';

const SESSION_COOKIE_NAME = 'homeflix_session';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  const config = getServerConfig();
  const jellyfin = new JellyfinClient();

  // If requesting user list for the login picker
  if (action === 'users') {
    if (!jellyfin.isConfigured()) {
      return NextResponse.json({ users: [] });
    }
    try {
      const users = await jellyfin.getUsers();
      return NextResponse.json({
        users: users.map((u) => ({
          id: u.id,
          name: u.name,
          avatarUrl: jellyfin.getUserImageUrl(u.id),
          avatarColor: u.avatarColor,
          initials: u.initials,
        })),
      });
    } catch (e) {
      console.error('Failed fetching Jellyfin users for auth:', e);
      return NextResponse.json({ users: [] });
    }
  }

  // General auth status check
  const netCheck = isRequestLocalOrTailscale(request);
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  let sessionUser: { id: string; name: string } | null = null;
  if (sessionCookie) {
    try {
      sessionUser = JSON.parse(Buffer.from(sessionCookie, 'base64').toString('utf-8'));
    } catch {
      sessionUser = null;
    }
  }

  // If local or over Tailscale -> NO LOGIN REQUIRED!
  if (netCheck.isLocalOrTailscale) {
    return NextResponse.json({
      requiresAuth: false,
      isLocalOrTailscale: true,
      isAuthenticated: true,
      clientIp: netCheck.clientIp,
      reason: netCheck.reason,
      user: sessionUser || { name: 'Local User' },
    });
  }

  // External network (Internet without Tailscale)
  if (sessionUser && sessionUser.name) {
    return NextResponse.json({
      requiresAuth: false,
      isLocalOrTailscale: false,
      isAuthenticated: true,
      clientIp: netCheck.clientIp,
      reason: netCheck.reason,
      user: sessionUser,
    });
  }

  // External network and NOT authenticated -> SHOW LOGIN!
  return NextResponse.json({
    requiresAuth: true,
    isLocalOrTailscale: false,
    isAuthenticated: false,
    clientIp: netCheck.clientIp,
    reason: netCheck.reason,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action || 'login';

    if (action === 'logout') {
      const response = NextResponse.json({ success: true, message: 'Logged out' });
      response.cookies.delete(SESSION_COOKIE_NAME);
      response.cookies.delete('homeflix_profile_id');
      return response;
    }

    const { username, password } = body;
    if (!username) {
      return NextResponse.json(
        { success: false, error: 'Username is required' },
        { status: 400 }
      );
    }

    const config = getServerConfig();
    const jellyfinUrl = (config.jellyfinUrl || '').replace(/\/+$/, '');

    if (!jellyfinUrl) {
      return NextResponse.json(
        { success: false, error: 'Jellyfin is not configured on the server' },
        { status: 503 }
      );
    }

    // Authenticate credentials against Jellyfin
    const authRes = await fetch(`${jellyfinUrl}/Users/AuthenticateByName`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `MediaBrowser Client="${config.appName || 'HomeStream'}", Device="Web", DeviceId="homeflix-web", Version="1.0.0"`,
      },
      body: JSON.stringify({
        Username: username.trim(),
        Pw: password || '',
      }),
    });

    if (!authRes.ok) {
      const errText = await authRes.text();
      return NextResponse.json(
        { success: false, error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    const authData = await authRes.json();
    const user = authData.User;
    const sessionPayload = {
      id: user.Id,
      name: user.Name,
      accessToken: authData.AccessToken,
      timestamp: Date.now(),
    };

    const encodedSession = Buffer.from(JSON.stringify(sessionPayload)).toString('base64');

    // Ensure profile exists in profiles.json for this Jellyfin user
    try {
      const { importProfilesFromJellyfin } = await import('@/lib/profiles');
      await importProfilesFromJellyfin([user.Id]);
    } catch (e) {
      console.warn('Failed auto-importing profile on external login:', e);
    }

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.Id,
        name: user.Name,
      },
    });

    // 30 days session
    response.cookies.set(SESSION_COOKIE_NAME, encodedSession, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    // Automatically lock homeflix_profile_id to the logged-in user
    response.cookies.set('homeflix_profile_id', user.Id, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error('Error during authentication:', error);
    return NextResponse.json(
      { success: false, error: 'Server authentication error' },
      { status: 500 }
    );
  }
}

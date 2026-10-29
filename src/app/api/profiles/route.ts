import { NextRequest, NextResponse } from 'next/server';
import { JellyfinClient } from '@/lib/jellyfin';
import { getServerConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const jellyfin = new JellyfinClient();
    const profiles = await jellyfin.getUsers();

    const config = getServerConfig();
    const cookieProfileId = request.cookies.get('homeflix_profile_id')?.value;

    let activeProfileId = '';

    if (cookieProfileId && profiles.some((p) => p.id === cookieProfileId)) {
      activeProfileId = cookieProfileId;
    } else if (config.jellyfinUserId && profiles.some((p) => p.id === config.jellyfinUserId)) {
      activeProfileId = config.jellyfinUserId;
    } else {
      const nathanProfile = profiles.find((p) => p.name.toLowerCase().includes('nathan'));
      activeProfileId = nathanProfile?.id || profiles[0]?.id || '';
    }

    const response = NextResponse.json({
      profiles,
      activeProfileId,
    });

    // If active profile was resolved and cookie was missing, set default cookie
    if (activeProfileId && !cookieProfileId) {
      response.cookies.set({
        name: 'homeflix_profile_id',
        value: activeProfileId,
        path: '/',
        maxAge: 31536000,
        sameSite: 'lax',
      });
    }

    return response;
  } catch (error) {
    console.error('Failed to get user profiles:', error);
    return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { profileId } = body;

    if (!profileId || typeof profileId !== 'string') {
      return NextResponse.json({ error: 'Valid profileId is required' }, { status: 400 });
    }

    const response = NextResponse.json({
      success: true,
      activeProfileId: profileId,
    });

    response.cookies.set({
      name: 'homeflix_profile_id',
      value: profileId,
      path: '/',
      maxAge: 31536000, // 1 year
      sameSite: 'lax',
      httpOnly: false,
    });

    return response;
  } catch (error) {
    console.error('Failed to save profile selection:', error);
    return NextResponse.json({ error: 'Failed to save profile selection' }, { status: 500 });
  }
}

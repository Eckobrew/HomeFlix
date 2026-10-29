import { NextRequest, NextResponse } from 'next/server';
import {
  getHomeflixProfiles,
  addHomeflixProfile,
  deleteHomeflixProfile,
} from '@/lib/profiles';
import { getServerConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const profiles = await getHomeflixProfiles();
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
    const { action = 'select', profileId, name, paletteIndex } = body;

    // 1. Create a new decoupled profile
    if (action === 'create') {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'Profile name is required' }, { status: 400 });
      }

      const newProfile = await addHomeflixProfile(name, paletteIndex);
      const allProfiles = await getHomeflixProfiles();

      const response = NextResponse.json({
        success: true,
        profile: newProfile,
        profiles: allProfiles,
        activeProfileId: newProfile.id,
      });

      response.cookies.set({
        name: 'homeflix_profile_id',
        value: newProfile.id,
        path: '/',
        maxAge: 31536000,
        sameSite: 'lax',
        httpOnly: false,
      });

      return response;
    }

    // 2. Delete a profile
    if (action === 'delete') {
      if (!profileId) {
        return NextResponse.json({ error: 'profileId is required to delete' }, { status: 400 });
      }

      const deleted = await deleteHomeflixProfile(profileId);
      if (!deleted) {
        return NextResponse.json(
          { error: 'Cannot delete the only remaining profile' },
          { status: 400 }
        );
      }

      const allProfiles = await getHomeflixProfiles();
      const cookieProfileId = request.cookies.get('homeflix_profile_id')?.value;
      const newActiveId =
        cookieProfileId === profileId ? allProfiles[0]?.id || '' : cookieProfileId || allProfiles[0]?.id || '';

      const response = NextResponse.json({
        success: true,
        profiles: allProfiles,
        activeProfileId: newActiveId,
      });

      if (cookieProfileId === profileId && newActiveId) {
        response.cookies.set({
          name: 'homeflix_profile_id',
          value: newActiveId,
          path: '/',
          maxAge: 31536000,
          sameSite: 'lax',
          httpOnly: false,
        });
      }

      return response;
    }

    // 3. Default: Select existing profile
    const targetProfileId = profileId;
    if (!targetProfileId || typeof targetProfileId !== 'string') {
      return NextResponse.json({ error: 'Valid profileId is required' }, { status: 400 });
    }

    const response = NextResponse.json({
      success: true,
      activeProfileId: targetProfileId,
    });

    response.cookies.set({
      name: 'homeflix_profile_id',
      value: targetProfileId,
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
      httpOnly: false,
    });

    return response;
  } catch (error) {
    console.error('Failed to handle profile action:', error);
    return NextResponse.json({ error: 'Failed to process profile action' }, { status: 500 });
  }
}

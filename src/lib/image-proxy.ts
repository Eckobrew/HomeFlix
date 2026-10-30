import { NextRequest } from 'next/server';
import { getServerConfig } from '@/lib/config';

// 1x1 dark slate PNG fallback (so BitmapFactory never returns null and decode never crashes)
const FALLBACK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

export async function handleImage(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const itemId = searchParams.get('itemId');
  const userId = searchParams.get('userId');
  const type = searchParams.get('type') || 'Primary';
  const maxWidth = searchParams.get('maxWidth') || '600';
  const quality = searchParams.get('quality') || '90';
  const tag = searchParams.get('tag');
  const rawUrl = searchParams.get('url');

  // 1. Proxy safe external URLs (e.g., TMDB, Unsplash)
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (['image.tmdb.org', 'images.unsplash.com'].includes(parsed.hostname)) {
        const res = await fetch(rawUrl, {
          headers: { Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' },
        });
        if (res.ok) {
          const contentType = res.headers.get('content-type') || 'image/jpeg';
          const buffer = await res.arrayBuffer();
          if (buffer.byteLength > 0) {
            return new Response(buffer, {
              status: 200,
              headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=604800, stale-while-revalidate=2592000',
              },
            });
          }
        }
      }
    } catch {
      // Fall through to fallback
    }
  }

  // 2. Proxy Jellyfin User Avatars
  const config = getServerConfig();
  const jfUrl = config.jellyfinUrl ? config.jellyfinUrl.replace(/\/+$/, '') : '';
  const apiKey = config.jellyfinApiKey;

  if (userId && jfUrl) {
    try {
      const headers: Record<string, string> = { Accept: 'image/*' };
      if (apiKey) {
        headers['X-Emby-Token'] = apiKey;
      }
      const userRes = await fetch(`${jfUrl}/Users/${userId}/Images/Primary?quality=${quality}`, {
        headers,
      });
      if (userRes.ok) {
        const buffer = await userRes.arrayBuffer();
        if (buffer.byteLength > 0) {
          return new Response(buffer, {
            status: 200,
            headers: {
              'Content-Type': userRes.headers.get('content-type') || 'image/jpeg',
              'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            },
          });
        }
      }
    } catch {
      // Fall through
    }
  }

  // 3. Proxy Jellyfin Item Images (Primary, Backdrop, Thumb)
  if (itemId && jfUrl) {
    try {
      const headers: Record<string, string> = { Accept: 'image/*' };
      if (apiKey) {
        headers['X-Emby-Token'] = apiKey;
        headers['Authorization'] = `MediaBrowser Client="HomeStream", Device="Mobile", DeviceId="homestream-mobile", Version="1.0.0", Token="${apiKey}"`;
      }

      // First attempt: With maxWidth & quality (and api_key query param if needed)
      let query = `maxWidth=${maxWidth}&quality=${quality}`;
      if (tag) query += `&tag=${encodeURIComponent(tag)}`;
      if (apiKey) query += `&api_key=${encodeURIComponent(apiKey)}`;

      let res = await fetch(`${jfUrl}/Items/${itemId}/Images/${type}?${query}`, {
        headers,
        redirect: 'follow',
      });

      if (res.ok) {
        const buffer = await res.arrayBuffer();
        if (buffer.byteLength > 0) {
          return new Response(buffer, {
            status: 200,
            headers: {
              'Content-Type': res.headers.get('content-type') || 'image/jpeg',
              'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            },
          });
        }
      }

      // Second attempt: Unresized original image (bypassing Jellyfin SkiaSharp resizing failure!)
      const fallbackQuery = apiKey ? `api_key=${encodeURIComponent(apiKey)}` : '';
      res = await fetch(`${jfUrl}/Items/${itemId}/Images/${type}${fallbackQuery ? `?${fallbackQuery}` : ''}`, {
        headers,
        redirect: 'follow',
      });

      if (res.ok) {
        const buffer = await res.arrayBuffer();
        if (buffer.byteLength > 0) {
          return new Response(buffer, {
            status: 200,
            headers: {
              'Content-Type': res.headers.get('content-type') || 'image/jpeg',
              'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            },
          });
        }
      }

      // Third attempt: If it's an episode or season without primary image, fetch parent Series artwork
      const itemRes = await fetch(`${jfUrl}/Items/${itemId}?Fields=SeriesId,BackdropImageTags,ImageTags`, {
        headers,
      });
      if (itemRes.ok) {
        const itemData = await itemRes.json();
        const parentId = itemData.SeriesId || itemData.SeasonId;
        if (parentId && parentId !== itemId) {
          const parentRes = await fetch(`${jfUrl}/Items/${parentId}/Images/Primary${fallbackQuery ? `?${fallbackQuery}` : ''}`, {
            headers,
          });
          if (parentRes.ok) {
            const buffer = await parentRes.arrayBuffer();
            if (buffer.byteLength > 0) {
              return new Response(buffer, {
                status: 200,
                headers: {
                  'Content-Type': parentRes.headers.get('content-type') || 'image/jpeg',
                  'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
                },
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('Image proxy fetch error:', err);
    }
  }

  // 4. Fallback valid image
  return new Response(FALLBACK_PNG, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

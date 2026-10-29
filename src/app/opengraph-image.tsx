import { ImageResponse } from 'next/og';

export const alt = 'HomeFlix - Modern Self-Hosted Streaming Client';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0a0a0a 0%, #141414 50%, #1a0505 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'radial-gradient(circle at 50% 40%, rgba(220, 38, 38, 0.25) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}
        >
          <span
            style={{
              fontSize: 84,
              fontWeight: 900,
              letterSpacing: '0.08em',
              color: '#dc2626',
              textShadow: '0 0 40px rgba(220, 38, 38, 0.6)',
            }}
          >
            HOMEFLIX
          </span>
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: '#ffffff',
            maxWidth: 800,
            textAlign: 'center',
            lineHeight: 1.4,
            marginBottom: 16,
          }}
        >
          Modern Self-Hosted Streaming Client
        </div>
        <div
          style={{
            fontSize: 18,
            color: '#a3a3a3',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span>Jellyfin Library</span>
          <span>•</span>
          <span>Multi-Profile Continue Watching</span>
          <span>•</span>
          <span>Chromecast</span>
          <span>•</span>
          <span>Overseerr</span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

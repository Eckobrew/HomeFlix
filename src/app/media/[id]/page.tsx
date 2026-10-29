import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { JellyfinClient } from '@/lib/jellyfin';
import { MOCK_HERO_ITEM, MOCK_CONTINUE_WATCHING, MOCK_RECENT_MOVIES, MOCK_RECENT_SERIES } from '@/lib/mock-data';
import { MediaItem } from '@/types';

interface MediaPageProps {
  params: {
    id: string;
  };
}

async function getMediaItem(id: string): Promise<MediaItem | null> {
  const jellyfin = new JellyfinClient();
  if (jellyfin.isConfigured() && !id.startsWith('mock-')) {
    try {
      const item = await jellyfin.getItemDetails(id);
      if (item) return item;
    } catch (e) {
      console.error('Failed fetching media item for metadata:', e);
    }
  }

  const allMock = [
    MOCK_HERO_ITEM,
    ...MOCK_CONTINUE_WATCHING,
    ...MOCK_RECENT_MOVIES,
    ...MOCK_RECENT_SERIES,
  ];
  return allMock.find((m) => m.id === id) || null;
}

export async function generateMetadata({ params }: MediaPageProps): Promise<Metadata> {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://homeflix.eckonet.uk';
  const item = await getMediaItem(params.id);

  if (!item) {
    return {
      title: 'Watch on HomeFlix',
      description: 'Stream movies and series on HomeFlix.',
    };
  }

  const titleWithYear = item.year ? `${item.title} (${item.year})` : item.title;
  const description = item.overview || `Watch ${titleWithYear} streaming on HomeFlix.`;
  const imageUrl = item.backdropUrl || item.posterUrl;

  return {
    title: `${titleWithYear} - Watch on HomeFlix`,
    description,
    alternates: {
      canonical: `${siteUrl}/media/${item.id}`,
    },
    openGraph: {
      title: `${titleWithYear} | HomeFlix`,
      description,
      url: `${siteUrl}/media/${item.id}`,
      siteName: 'HomeFlix',
      images: imageUrl
        ? [
            {
              url: imageUrl,
              width: 1280,
              height: 720,
              alt: titleWithYear,
            },
          ]
        : undefined,
      type: item.type === 'Series' ? 'video.tv_show' : 'video.movie',
    },
    twitter: {
      card: 'summary_large_image',
      title: titleWithYear,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export default async function MediaPage({ params }: MediaPageProps) {
  // Seamlessly route into the main app with the media modal opened
  redirect(`/?media=${params.id}`);
}

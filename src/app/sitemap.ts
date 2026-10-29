import { MetadataRoute } from 'next';
import { JellyfinClient } from '@/lib/jellyfin';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://homeflix.eckonet.uk';
  const lastModified = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}`,
      lastModified,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${siteUrl}/?tab=movies`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/?tab=series`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/?tab=requests`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.7,
    },
  ];

  try {
    const jellyfin = new JellyfinClient();
    if (jellyfin.isConfigured()) {
      const [movies, series] = await Promise.all([
        jellyfin.getLatestMedia('Movie', 30),
        jellyfin.getLatestMedia('Series', 30),
      ]);

      const mediaRoutes: MetadataRoute.Sitemap = [...movies, ...series].map((item) => ({
        url: `${siteUrl}/media/${item.id}`,
        lastModified,
        changeFrequency: 'weekly',
        priority: 0.8,
      }));

      return [...staticRoutes, ...mediaRoutes];
    }
  } catch (err) {
    console.error('Error generating dynamic sitemap from Jellyfin:', err);
  }

  return staticRoutes;
}

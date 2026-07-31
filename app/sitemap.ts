import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://tekken8stats.vercel.app/',
      changeFrequency: 'daily',
      priority: 1,
    },
  ];
}

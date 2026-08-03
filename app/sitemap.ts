import type { MetadataRoute } from 'next';
import { abs } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: abs('/'),
      changeFrequency: 'daily',
      priority: 1,
    },
  ];
}

import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/** Закрытые и служебные разделы не индексируются; карта сайта — рядом. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/lab', '/en/lab'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

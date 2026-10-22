import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://researchpilot-ai.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/architecture', '/login', '/register', '/forgot-password'],
        disallow: ['/api/', '/_next/', '/settings'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}

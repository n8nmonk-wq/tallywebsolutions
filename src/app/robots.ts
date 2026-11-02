import type { MetadataRoute } from "next";

import { siteUrl } from '@/lib/store';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/order/", "/checkout", '/library', '/author', '/login', '/cart'] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}

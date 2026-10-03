import type { APIRoute } from 'astro';
import { sitemapEvents } from '../lib/events';
import { sitemapXml } from '../lib/seo';

export const prerender = false;

/** Static pages plus every published event, so a new event is findable without anyone editing a file. */
export const GET: APIRoute = async ({ url }) => {
  return new Response(sitemapXml(url.origin, await sitemapEvents()), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};

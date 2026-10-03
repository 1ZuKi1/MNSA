import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isIndexableHost, robotsTxt } from '../lib/seo';

export const prerender = false;

/** Only pkumongolia.com asks to be indexed. The workers.dev test addresses and the staff host disallow everything. */
export const GET: APIRoute = ({ url }) => {
  const indexable = isIndexableHost(url.hostname, env.PUBLIC_HOST || 'pkumongolia.com');
  return new Response(robotsTxt(url.origin, indexable), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};

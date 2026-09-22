/**
 * Worker entry. One Worker serves both hostnames:
 *
 *   bdmnsa.com        public site   — prerendered pages; events pages rendered per request + edge-cached
 *   dep.bdmnsa.com    staff site    — every page rendered per request behind a login
 *
 * Staff pages live in src/pages/dep/ but are served at clean URLs on the staff host
 * (dep.bdmnsa.com/barimt → /dep/barimt internally). On the public host, /dep does not exist.
 */
import { handle } from '@astrojs/cloudflare/handler';
import { isLocalHost, isStaffHost, publicCacheSeconds, shouldPrefixStaffPath, STAFF_PREFIX } from './lib/hosts';

const COMMON_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const STAFF_HEADERS: Record<string, string> = {
  ...COMMON_HEADERS,
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};

function withHeaders(res: Response, headers: Record<string, string>): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) if (!out.headers.has(k) || k === 'Cache-Control') out.headers.set(k, v);
  return out;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    // ── staff host ──────────────────────────────────────────────────────────
    if (isStaffHost(url.hostname, env.STAFF_HOST)) {
      let req = request;
      if (shouldPrefixStaffPath(url.pathname)) {
        url.pathname = STAFF_PREFIX + (url.pathname === '/' ? '' : url.pathname);
        req = new Request(url.toString(), request) as typeof request;
      }
      const res = await handle(req, env, ctx);
      // Static assets and photos keep their own caching; everything else is private and uncached.
      const isAsset = /^\/(_astro|brand|media)\//.test(url.pathname);
      return withHeaders(res, isAsset ? COMMON_HEADERS : STAFF_HEADERS);
    }

    // ── public host ─────────────────────────────────────────────────────────
    if (url.pathname === STAFF_PREFIX || url.pathname.startsWith(STAFF_PREFIX + '/')) {
      return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }

    const ttl = request.method === 'GET' && !isLocalHost(url.hostname) ? publicCacheSeconds(url.pathname) : null;
    if (ttl) {
      // Edge cache: a traffic spike costs one database read per 5 minutes per Cloudflare location, not one per visitor.
      const cache = (caches as unknown as { default: Cache }).default;
      const key = new Request(url.toString(), { method: 'GET' });
      const hit = await cache.match(key);
      if (hit) return hit;
      const res = await handle(request, env, ctx);
      if (res.status !== 200) return withHeaders(res, COMMON_HEADERS);
      const cacheControl = ttl > 3600 ? `public, max-age=${ttl}, immutable` : `public, max-age=60, s-maxage=${ttl}`;
      const out = withHeaders(res, { ...COMMON_HEADERS, 'Cache-Control': cacheControl });
      ctx.waitUntil(cache.put(key, out.clone()));
      return out;
    }

    return withHeaders(await handle(request, env, ctx), COMMON_HEADERS);
  },
} satisfies ExportedHandler<Env>;

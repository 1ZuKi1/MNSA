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

/**
 * Test deployment only (TEST_MODE=1 on a *.workers.dev host): mark every public page as a test —
 * a red banner and noindex — including pages that were prerendered at build time.
 */
/**
 * The workers.dev deployment is kept out of search engines until the real domain is attached. It used to
 * carry a red «Туршилтын хувилбар» ribbon too; that went when the real team moved onto it (2026-09-26) —
 * this IS the association's site now, just on a temporary address.
 */
function markAsTest(res: Response): Response {
  const marked = new Response(res.body, res);
  marked.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return marked;
}

function withHeaders(res: Response, headers: Record<string, string>): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) if (!out.headers.has(k) || k === 'Cache-Control') out.headers.set(k, v);
  return out;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    // Browsers ask for /favicon.ico on their own (a PDF opened on its own, for one); the icon is an SVG.
    if (url.pathname === '/favicon.ico') return Response.redirect(new URL('/favicon.svg', url).toString(), 301);

    // ── staff host ──────────────────────────────────────────────────────────
    if (env.SITE_MODE === 'staff' || isStaffHost(url.hostname, env.STAFF_HOST)) {
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

    const test = env.TEST_MODE === '1' && url.hostname.endsWith('.workers.dev');
    const finish = (r: Response) => (test ? markAsTest(r) : r);

    const ttl = request.method === 'GET' && !isLocalHost(url.hostname) ? publicCacheSeconds(url.pathname) : null;
    if (ttl) {
      // Edge cache: a traffic spike costs one database read per 5 minutes per Cloudflare location, not one per visitor.
      const cache = (caches as unknown as { default: Cache }).default;
      const key = new Request(url.toString(), { method: 'GET' });
      const hit = await cache.match(key);
      if (hit) return finish(hit);
      const res = await handle(request, env, ctx);
      if (res.status !== 200) return finish(withHeaders(res, COMMON_HEADERS));
      const cacheControl = ttl > 3600 ? `public, max-age=${ttl}, immutable` : `public, max-age=60, s-maxage=${ttl}`;
      const out = withHeaders(res, { ...COMMON_HEADERS, 'Cache-Control': cacheControl });
      ctx.waitUntil(cache.put(key, out.clone()));
      return finish(out);
    }

    return finish(withHeaders(await handle(request, env, ctx), COMMON_HEADERS));
  },
} satisfies ExportedHandler<Env>;

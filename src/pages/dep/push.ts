import type { APIRoute } from 'astro';
import { rateLimit } from '../../lib/db';
import { parseSubscription, pushPublicKey, pushToUsers, removeSubscription, saveSubscription } from '../../lib/push';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/**
 * The notifications page talks to this (public/sw.js too, when Apple or Google replace a subscription).
 * Behind the login like every staff page. JSON only, and only from this same site: a JSON POST from
 * another site needs a CORS preflight we never answer, and the Origin check below covers the rest.
 *
 *   { action: 'subscribe',   subscription }   this device now gets notifications
 *   { action: 'unsubscribe', endpoint }       it doesn't any more
 *   { action: 'test' }                        send a test notification to all my devices
 */
export const POST: APIRoute = async ({ request, locals, url }) => {
  const user = locals.user;
  if (!user) return json(401, { error: 'login' });
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json(403, { error: 'origin' });
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return json(415, { error: 'json' });
  if (!pushPublicKey()) return json(503, { error: 'not-configured' });

  let body: { action?: string; subscription?: unknown; endpoint?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'bad-json' });
  }

  switch (body.action) {
    case 'subscribe': {
      const sub = parseSubscription(body.subscription);
      if (!sub) return json(400, { error: 'bad-subscription' });
      if (!(await rateLimit(`push-sub:${user.id}`, 20, 3600))) return json(429, { error: 'slow-down' });
      await saveSubscription(user.id, sub, request.headers.get('user-agent'));
      return json(200, { ok: true });
    }
    case 'unsubscribe': {
      if (typeof body.endpoint !== 'string' || body.endpoint.length > 1000) return json(400, { error: 'bad-endpoint' });
      await removeSubscription(user.id, body.endpoint);
      return json(200, { ok: true });
    }
    case 'test': {
      if (!(await rateLimit(`push-test:${user.id}`, 5, 600))) return json(429, { error: 'slow-down' });
      const sent = await pushToUsers([user.id], {
        title: 'Мэдэгдэл ажиллаж байна',
        body: 'Ажлын орчны мэдэгдэл энэ төхөөрөмжид ингэж ирнэ.',
        url: '/medegdel',
        tag: 'test',
      });
      return json(200, { ok: true, sent });
    }
    default:
      return json(400, { error: 'action' });
  }
};

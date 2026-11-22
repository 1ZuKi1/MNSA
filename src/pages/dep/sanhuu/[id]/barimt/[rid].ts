import type { APIRoute } from 'astro';
import { asFinanceLike, financeActor, getFinance, receiptMedia } from '../../../../../lib/finance';
import { int } from '../../../../../lib/http';
import { loadImage } from '../../../../../lib/media';
import * as P from '../../../../../lib/permissions';

export const prerender = false;

/**
 * A receipt photo. Private in the media database: only someone who may read the request sees it, never
 * from a cache and never on the public site.
 */
export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  const id = int(params.id ?? '');
  const rid = int(params.rid ?? '');
  if (!user || !id || !rid) return new Response('Not found', { status: 404 });
  const [r, m] = await Promise.all([getFinance(id), receiptMedia(rid)]);
  if (!r || !m || m.request_id !== r.id || !P.canReadMoney(await financeActor(user), asFinanceLike(r))) return new Response('Not found', { status: 404 });
  const img = await loadImage(m.media_id, { private: true });
  if (!img) return new Response('Not found', { status: 404 });
  return new Response(img.bytes, { headers: { 'Content-Type': img.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
};

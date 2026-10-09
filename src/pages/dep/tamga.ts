import type { APIRoute } from 'astro';
import { loadImage } from '../../lib/media';
import { stampId, stampKind } from '../../lib/settings';

export const prerender = false;

/**
 * An official stamp image: the round one, or the square one with ?kind=square. Behind the staff login (the
 * middleware guards every /dep path), never stored in any cache, and absent from the public /media route.
 */
export const GET: APIRoute = async ({ url }) => {
  const id = await stampId(stampKind(url.searchParams.get('kind')));
  const img = id ? await loadImage(id, { private: true }) : null;
  if (!img) return new Response('Not found', { status: 404 });
  return new Response(img.bytes, {
    headers: {
      'Content-Type': img.mime,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};

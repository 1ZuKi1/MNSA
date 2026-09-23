import type { APIRoute } from 'astro';
import { loadImage } from '../../lib/media';
import { stampId } from '../../lib/settings';

export const prerender = false;

/**
 * The official stamp image. Behind the staff login (the middleware guards every /dep path), never stored
 * in any cache, and absent from the public /media route.
 */
export const GET: APIRoute = async () => {
  const id = await stampId();
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

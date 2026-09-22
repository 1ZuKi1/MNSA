import type { APIRoute } from 'astro';
import { loadImage } from '../../lib/media';

export const prerender = false;

/** Photos. The random id is the permission; the bytes never change, so they cache forever at the edge. */
export const GET: APIRoute = async ({ params }) => {
  const img = await loadImage(params.id ?? '');
  if (!img) return new Response('Not found', { status: 404 });
  return new Response(img.bytes, {
    headers: {
      'Content-Type': img.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};

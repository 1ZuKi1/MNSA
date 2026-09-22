import type { APIRoute } from 'astro';
import { clearSessionCookie } from '../../lib/session';

export const prerender = false;

/** Logout. POST only, so a link or image can't log someone out. */
export const POST: APIRoute = ({ cookies, url, redirect }) => {
  clearSessionCookie(cookies, url);
  return redirect('/nevtreh');
};

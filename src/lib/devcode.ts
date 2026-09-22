/**
 * Local development convenience: show the login code on screen so a demo doesn't need a terminal.
 * Double-guarded — needs DEV_SHOW_CODES=1 AND a *.localhost hostname. Can never fire on bdmnsa.com.
 */
import type { AstroCookies } from 'astro';
import { env } from 'cloudflare:workers';
import { isLocalHost } from './hosts';

const NAME = 'mnsa_devcode';
const enabled = (url: URL) => env.DEV_SHOW_CODES === '1' && isLocalHost(url.hostname);

export function stashDevCode(cookies: AstroCookies, url: URL, code: string) {
  if (enabled(url)) cookies.set(NAME, code, { path: '/', maxAge: 600, httpOnly: true, sameSite: 'lax' });
}

export function takeDevCode(cookies: AstroCookies, url: URL): string | null {
  if (!enabled(url)) return null;
  const v = cookies.get(NAME)?.value ?? null;
  return v && /^\d{6}$/.test(v) ? v : null;
}

export function clearDevCode(cookies: AstroCookies) {
  cookies.delete(NAME, { path: '/' });
}

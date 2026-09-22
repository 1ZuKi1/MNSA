/**
 * Show the login code on screen: local dev (DEV_SHOW_CODES=1 on *.localhost) or the workers.dev
 * test deployment (TEST_MODE=1 on *.workers.dev). Both are host-guarded; neither can fire on bdmnsa.com.
 */
import type { AstroCookies } from 'astro';
import { showCodesOnScreen } from './site';

const NAME = 'mnsa_devcode';
const enabled = showCodesOnScreen;

export function stashDevCode(cookies: AstroCookies, url: URL, code: string) {
  if (enabled(url)) cookies.set(NAME, code, { path: '/', maxAge: 600, httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:' });
}

export function takeDevCode(cookies: AstroCookies, url: URL): string | null {
  if (!enabled(url)) return null;
  const v = cookies.get(NAME)?.value ?? null;
  return v && /^\d{6}$/.test(v) ? v : null;
}

export function clearDevCode(cookies: AstroCookies) {
  cookies.delete(NAME, { path: '/' });
}

/**
 * Where things live, and whether this is the throwaway test deployment.
 *
 * Production: one Worker, bdmnsa.com + dep.bdmnsa.com.
 * Test (before the domain exists): the same build deployed twice on workers.dev —
 *   mnsa.<account>.workers.dev      public
 *   mnsa-dep.<account>.workers.dev  staff (SITE_MODE=staff)
 */
import { env } from 'cloudflare:workers';
import { isLocalHost } from './hosts';

/**
 * Test mode shows login codes on screen, because there is no domain for Resend yet.
 * Double-guarded: needs TEST_MODE=1 AND a *.workers.dev hostname, so it can never fire on bdmnsa.com.
 */
export const isTestMode = (url: URL) => env.TEST_MODE === '1' && url.hostname.endsWith('.workers.dev');

/** Show codes on screen: local dev, or the test deployment. */
export const showCodesOnScreen = (url: URL) =>
  (env.DEV_SHOW_CODES === '1' && isLocalHost(url.hostname)) || isTestMode(url);

/** The public site's origin, as seen from the staff site. */
export const publicOrigin = (url: URL) => env.PUBLIC_ORIGIN || `${url.protocol}//${url.host.replace(/^dep\./, '')}`;

/** The staff site's origin, for links inside emails. */
export const staffOrigin = () => env.STAFF_ORIGIN || 'https://dep.bdmnsa.com';

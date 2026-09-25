/// <reference types="@cloudflare/workers-types" />
/// <reference types="@astrojs/cloudflare/types.d.ts" />

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    MEDIA: D1Database;
    ASSETS: Fetcher;

    PUBLIC_HOST?: string;
    STAFF_HOST?: string;
    MAIL_FROM?: string;

    /** Signs session cookies and keys the login-code hashes. Required. */
    SESSION_SECRET?: string;
    /** Unset in local dev → login codes are printed to the terminal instead of emailed. */
    RESEND_API_KEY?: string;
    TURNSTILE_SITE_KEY?: string;
    TURNSTILE_SECRET?: string;
    /** Local dev only: also shows the login code on screen. Ignored unless the host is *.localhost. */
    DEV_SHOW_CODES?: string;
    /** 'staff' makes every request a staff request (the workers.dev test deployment has no dep. subdomain). */
    SITE_MODE?: string;
    /** '1' on the workers.dev test deployment only: login codes on screen + a red banner. Ignored on any other host. */
    TEST_MODE?: string;
    /** Test deployment only: a shared passphrase the login page asks for while codes are shown on screen. */
    STAFF_GATE?: string;
    /** Overrides for cross-links between the two sites (test deployment). */
    PUBLIC_ORIGIN?: string;
    STAFF_ORIGIN?: string;
  }
}
interface Env extends Cloudflare.Env {}

declare namespace App {
  interface Locals {
    user: import('./lib/types').SessionUser | null;
  }
}

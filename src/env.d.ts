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
  }
}
interface Env extends Cloudflare.Env {}

declare namespace App {
  interface Locals {
    user: import('./lib/types').SessionUser | null;
  }
}

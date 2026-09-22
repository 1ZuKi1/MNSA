/**
 * Auth gate for the staff area. Runs only for /dep/* (the worker maps dep.bdmnsa.com/* there).
 * The session is re-validated against the database on every request, so removing someone,
 * changing their role or letting their term lapse takes effect immediately.
 */
import { defineMiddleware } from 'astro:middleware';
import { cleanStaffPath, STAFF_PREFIX } from './lib/hosts';
import { currentUser } from './lib/session';

const OPEN = [/^\/dep\/nevtreh\/?$/, /^\/dep\/urilga\/[A-Za-z0-9_-]+\/?$/];

export const onRequest = defineMiddleware(async (ctx, next) => {
  ctx.locals.user = null;
  const path = ctx.url.pathname;
  if (!(path === STAFF_PREFIX || path.startsWith(STAFF_PREFIX + '/'))) return next();

  ctx.locals.user = await currentUser(ctx.cookies, ctx.url);
  if (!ctx.locals.user && !OPEN.some((r) => r.test(path))) {
    const back = cleanStaffPath(path) + ctx.url.search;
    return ctx.redirect(back === '/' ? '/nevtreh' : `/nevtreh?next=${encodeURIComponent(back)}`);
  }
  return next();
});

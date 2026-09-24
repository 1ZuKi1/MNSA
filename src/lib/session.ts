/**
 * Stateless sessions: a signed cookie, no server-side store (zero KV/D1 writes per request).
 * Revocation still works instantly: each request re-reads the user row and compares session_version.
 */
import type { AstroCookies } from 'astro';
import { env } from 'cloudflare:workers';
import { b64url, fromB64url, hmac, safeEqual } from './crypto';
import { one } from './db';
import { now } from './time';
import type { DeptSlug, Role, SessionUser } from './types';

const LIFETIME = 30 * 24 * 3600; // 30 days — 10 trusted people on their own devices

interface Payload {
  u: number; // user id
  v: number; // session_version at login
  exp: number;
}

export function secret(): string {
  const s = env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET is missing or shorter than 32 characters');
  return s;
}

/** __Host- prefix forces Secure + Path=/ + no Domain: the cookie can never leak to bdmnsa.com. */
export const cookieName = (url: URL) => (url.protocol === 'https:' ? '__Host-mnsa_s' : 'mnsa_s');

export async function signSession(userId: number, version: number): Promise<string> {
  const payload: Payload = { u: userId, v: version, exp: now() + LIFETIME };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = b64url(await hmac(secret(), `s1.${body}`));
  return `${body}.${sig}`;
}

export async function verifySession(token: string | undefined): Promise<Payload | null> {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = await hmac(secret(), `s1.${body}`);
  if (!safeEqual(fromB64url(sig), expected)) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Payload;
    return p.exp > now() ? p : null;
  } catch {
    return null;
  }
}

export function setSessionCookie(cookies: AstroCookies, url: URL, token: string) {
  cookies.set(cookieName(url), token, {
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: LIFETIME,
    // No `domain` → host-only. This is the whole point of dep.bdmnsa.com being a subdomain.
  });
}

/** Browsers ignore a __Host- cookie's delete unless it also says Secure — without it, logout does nothing. */
export function clearSessionCookie(cookies: AstroCookies, url: URL) {
  cookies.delete(cookieName(url), { path: '/', secure: url.protocol === 'https:', httpOnly: true, sameSite: 'lax' });
}

interface UserRow {
  id: number;
  email: string;
  name_mn: string;
  role: Role;
  department_id: number | null;
  dept_slug: DeptSlug | null;
  is_deputy: number;
  status: string;
  session_version: number;
  term_ends_at: number | null;
}

export async function loadActiveUser(id: number): Promise<(SessionUser & { sessionVersion: number }) | null> {
  const r = await one<UserRow>(
    `SELECT u.id, u.email, u.name_mn, u.role, u.department_id, d.slug AS dept_slug, u.is_deputy,
            u.status, u.session_version, u.term_ends_at
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.id = ?`,
    id,
  );
  if (!r || r.status !== 'active') return null;
  if (r.term_ends_at !== null && r.term_ends_at < now()) return null; // expired: not renewed this year
  return {
    id: r.id,
    email: r.email,
    name: r.name_mn,
    role: r.role,
    dept: r.dept_slug,
    deptId: r.department_id,
    isDeputy: r.is_deputy === 1,
    termEndsAt: r.term_ends_at,
    sessionVersion: r.session_version,
  };
}

export async function currentUser(cookies: AstroCookies, url: URL): Promise<SessionUser | null> {
  const p = await verifySession(cookies.get(cookieName(url))?.value);
  if (!p) return null;
  const user = await loadActiveUser(p.u);
  if (!user || user.sessionVersion !== p.v) return null;
  const { sessionVersion: _v, ...rest } = user;
  return rest;
}

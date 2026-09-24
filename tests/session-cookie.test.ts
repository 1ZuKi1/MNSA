import { describe, expect, it, vi } from 'vitest';
import type { AstroCookies } from 'astro';

vi.mock('cloudflare:workers', () => ({ env: {} }));
const { clearSessionCookie } = await import('../src/lib/session');

/** What logout asks Astro to delete. */
const logout = (href: string) => {
  const calls: [string, Record<string, unknown> | undefined][] = [];
  const cookies = { delete: (name: string, opts?: Record<string, unknown>) => calls.push([name, opts]) } as unknown as AstroCookies;
  clearSessionCookie(cookies, new URL(href));
  return calls;
};

describe('logout', () => {
  // Browsers ignore a Set-Cookie for a __Host- cookie unless it says Secure — a delete included.
  // Without it, pressing «Гарах» on the live site leaves the person logged in.
  it('deletes the __Host- session cookie on https with Secure, so the browser accepts it', () => {
    expect(logout('https://dep.bdmnsa.com/gar')).toEqual([['__Host-mnsa_s', expect.objectContaining({ path: '/', secure: true })]]);
  });

  it('deletes the plain cookie in local development (http)', () => {
    expect(logout('http://dep.localhost:4321/gar')).toEqual([['mnsa_s', expect.objectContaining({ path: '/', secure: false })]]);
  });
});

/**
 * Which site a request belongs to.
 *   dep.bdmnsa.com, dep.localhost (dev)  → staff
 *   everything else                      → public
 */
export function isStaffHost(hostname: string, staffHosts?: string): boolean {
  const h = hostname.toLowerCase();
  if (h.startsWith('dep.')) return true;
  return (staffHosts ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(h);
}

export const isLocalHost = (hostname: string) =>
  hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1';

/** Staff pages live under src/pages/dep/ but are served at clean URLs on the staff host. */
export const STAFF_PREFIX = '/dep';

/** Paths on the staff host that must NOT be mapped under /dep (assets, dev tooling, shared media). */
export function shouldPrefixStaffPath(pathname: string): boolean {
  if (pathname === STAFF_PREFIX || pathname.startsWith(STAFF_PREFIX + '/')) return false;
  if (/^\/(_astro|@|node_modules|src|brand|files|media)(\/|$)/.test(pathname)) return false;
  if (pathname.startsWith('/@') || pathname.startsWith('/__')) return false;
  if (pathname === '/favicon.svg' || pathname === '/apple-touch-icon.png') return false;
  return true;
}

/** "/dep/barimt/3" → "/barimt/3" (for links and redirects on the staff host). */
export function cleanStaffPath(pathname: string): string {
  if (pathname === STAFF_PREFIX) return '/';
  return pathname.startsWith(STAFF_PREFIX + '/') ? pathname.slice(STAFF_PREFIX.length) : pathname;
}

/** Public paths that are rendered per request and edge-cached. */
export function publicCacheSeconds(pathname: string): number | null {
  if (pathname.startsWith('/media/')) return 31536000; // photo URLs are content-addressed by random id → immutable
  // Pages that read the database (events) — 5 minutes at the edge. The team page is not cached: a removed
  // photo or person must disappear at once, and it is one small query per visit.
  if (pathname === '/') return 300;
  if (pathname === '/uil-ajillagaa' || pathname.startsWith('/uil-ajillagaa/')) return 300;
  return null;
}

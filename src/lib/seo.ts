/** robots.txt + sitemap.xml. Pure string builders, so they can be tested without a Worker. */

/** Public pages that exist whatever is in the database. Events are added from the DB. */
export const STATIC_PATHS = ['/', '/taniltsuulga', '/udirdlaga', '/uil-ajillagaa', '/tosov', '/shine-oyutan', '/holboo-barih'];

/** Search engines may index only the real public domain (pkumongolia.com, with or without www) — never workers.dev, staff or localhost. */
export function isIndexableHost(hostname: string, publicHost: string): boolean {
  const h = hostname.toLowerCase();
  const p = publicHost.toLowerCase();
  return h === p || h === `www.${p}`;
}

export function robotsTxt(origin: string, indexable: boolean): string {
  if (!indexable) return 'User-agent: *\nDisallow: /\n';
  return ['User-agent: *', 'Allow: /', 'Disallow: /dep/', 'Disallow: /dep', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
}

export interface SitemapEvent {
  id: number;
  updated_at: number; // Unix seconds
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function sitemapXml(origin: string, events: SitemapEvent[]): string {
  const urls = [
    ...STATIC_PATHS.map((p) => `  <url><loc>${esc(origin + p)}</loc></url>`),
    ...events.map(
      (e) =>
        `  <url><loc>${esc(`${origin}/uil-ajillagaa/${e.id}`)}</loc><lastmod>${new Date(e.updated_at * 1000).toISOString().slice(0, 10)}</lastmod></url>`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

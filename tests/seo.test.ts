import { describe, expect, it } from 'vitest';
import { isIndexableHost, robotsTxt, sitemapXml } from '../src/lib/seo';

describe('robots.txt', () => {
  it('only the real public domain is indexable', () => {
    expect(isIndexableHost('pkumongolia.com', 'pkumongolia.com')).toBe(true);
    expect(isIndexableHost('www.pkumongolia.com', 'pkumongolia.com')).toBe(true);
    expect(isIndexableHost('team.pkumongolia.com', 'pkumongolia.com')).toBe(false);
    expect(isIndexableHost('mnsa.x.workers.dev', 'pkumongolia.com')).toBe(false);
    expect(isIndexableHost('localhost', 'pkumongolia.com')).toBe(false);
  });
  it('allows crawling and points at the sitemap on the live domain', () => {
    const t = robotsTxt('https://pkumongolia.com', true);
    expect(t).toContain('Allow: /');
    expect(t).toContain('Sitemap: https://pkumongolia.com/sitemap.xml');
  });
  it('blocks everything elsewhere', () => {
    expect(robotsTxt('https://team.pkumongolia.com', false)).toBe('User-agent: *\nDisallow: /\n');
  });
});

describe('sitemap.xml', () => {
  it('lists static pages and published events with lastmod', () => {
    const x = sitemapXml('https://pkumongolia.com', [{ id: 7, updated_at: Date.UTC(2026, 8, 1) / 1000 }]);
    expect(x).toContain('<loc>https://pkumongolia.com/</loc>');
    expect(x).toContain('<loc>https://pkumongolia.com/uil-ajillagaa</loc>');
    expect(x).toContain('<loc>https://pkumongolia.com/uil-ajillagaa/7</loc><lastmod>2026-09-01</lastmod>');
    expect(x).not.toContain('/dep');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SitemapParser, parseSitemap, mergeSitemapWithCrawler } from '../../../src/crawlers/sitemap-parser';

// Mock fetch
const originalFetch = global.fetch;

describe('SitemapParser', () => {
  let parser: SitemapParser;

  beforeEach(() => {
    parser = new SitemapParser('https://example.com', 5000);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('should create parser with base URL', () => {
    expect(parser).toBeDefined();
  });

  it('should create parser with custom timeout', () => {
    const customParser = new SitemapParser('https://example.com', 20000);
    expect(customParser).toBeDefined();
  });

  it('should parse sitemap.xml successfully', async () => {
    // Mock fetch responses
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('sitemap.xml')) {
        return {
          ok: true,
          text: async () => `
            <?xml version="1.0" encoding="UTF-8"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <url>
                <loc>https://example.com/page1</loc>
                <lastmod>2024-01-01</lastmod>
                <changefreq>daily</changefreq>
                <priority>1.0</priority>
              </url>
              <url>
                <loc>https://example.com/page2</loc>
              </url>
            </urlset>
          `,
        };
      }
      if (url.includes('robots.txt')) {
        return { ok: false, status: 404 };
      }
      return { ok: false };
    }) as any;

    const result = await parser.parse();

    expect(result).toBeDefined();
    expect(result.urls.length).toBeGreaterThan(0);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.urls).toContain('https://example.com/page1');
    expect(result.urls).toContain('https://example.com/page2');
  });

  it('should parse robots.txt for sitemap URLs', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('robots.txt')) {
        return {
          ok: true,
          text: async () => `
            User-agent: *
            Allow: /
            Sitemap: https://example.com/sitemap1.xml
            Sitemap: https://example.com/sitemap2.xml
          `,
        };
      }
      if (url.includes('sitemap1.xml')) {
        return {
          ok: true,
          text: async () => `
            <urlset>
              <url><loc>https://example.com/page1</loc></url>
            </urlset>
          `,
        };
      }
      if (url.includes('sitemap2.xml')) {
        return {
          ok: true,
          text: async () => `
            <urlset>
              <url><loc>https://example.com/page2</loc></url>
            </urlset>
          `,
        };
      }
      return { ok: false };
    }) as any;

    const result = await parser.parse();

    expect(result.urls).toContain('https://example.com/page1');
    expect(result.urls).toContain('https://example.com/page2');
    expect(result.sources).toContain('https://example.com/sitemap1.xml');
    expect(result.sources).toContain('https://example.com/sitemap2.xml');
  });

  it('should handle sitemap index files', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('sitemap.xml')) {
        return {
          ok: true,
          text: async () => `
            <?xml version="1.0" encoding="UTF-8"?>
            <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <sitemap>
                <loc>https://example.com/sitemap-posts.xml</loc>
              </sitemap>
              <sitemap>
                <loc>https://example.com/sitemap-pages.xml</loc>
              </sitemap>
            </sitemapindex>
          `,
        };
      }
      if (url.includes('sitemap-posts.xml')) {
        return {
          ok: true,
          text: async () => `
            <urlset>
              <url><loc>https://example.com/post1</loc></url>
              <url><loc>https://example.com/post2</loc></url>
            </urlset>
          `,
        };
      }
      if (url.includes('sitemap-pages.xml')) {
        return {
          ok: true,
          text: async () => `
            <urlset>
              <url><loc>https://example.com/page1</loc></url>
            </urlset>
          `,
        };
      }
      if (url.includes('robots.txt')) {
        return { ok: false };
      }
      return { ok: false };
    }) as any;

    const result = await parser.parse();

    expect(result.urls).toContain('https://example.com/post1');
    expect(result.urls).toContain('https://example.com/post2');
    expect(result.urls).toContain('https://example.com/page1');
  });

  it('should deduplicate URLs', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => `
        <urlset>
          <url><loc>https://example.com/page1</loc></url>
          <url><loc>https://example.com/page1</loc></url>
          <url><loc>https://example.com/page2</loc></url>
        </urlset>
      `,
    })) as any;

    const result = await parser.parse();

    // page1 should only appear once
    const page1Count = result.urls.filter(u => u === 'https://example.com/page1').length;
    expect(page1Count).toBe(1);
  });

  it('should handle fetch errors gracefully', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('Network error');
    }) as any;

    const result = await parser.parse();

    expect(result.urls.length).toBe(0);
    expect(result.errors.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle invalid URLs in sitemap', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => `
        <urlset>
          <url><loc>https://example.com/valid</loc></url>
          <url><loc>invalid-url</loc></url>
        </urlset>
      `,
    })) as any;

    const result = await parser.parse();

    expect(result.urls).toContain('https://example.com/valid');
  });

  it('should parse detailed sitemap info', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('sitemap.xml')) {
        return {
          ok: true,
          text: async () => `
            <urlset>
              <url>
                <loc>https://example.com/page1</loc>
                <lastmod>2024-01-01</lastmod>
                <changefreq>weekly</changefreq>
                <priority>0.8</priority>
              </url>
            </urlset>
          `,
        };
      }
      if (url.includes('robots.txt')) {
        return { ok: false };
      }
      return { ok: false };
    }) as any;

    const result = await parser.parseDetailed();

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].url).toBe('https://example.com/page1');
    expect(result[0].lastmod).toBe('2024-01-01');
    expect(result[0].changefreq).toBe('weekly');
    expect(result[0].priority).toBe(0.8);
  });
});

describe('parseSitemap helper function', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('should provide quick parsing functionality', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => `
        <urlset>
          <url><loc>https://example.com/page1</loc></url>
        </urlset>
      `,
    })) as any;

    const result = await parseSitemap('https://example.com');

    expect(result).toBeDefined();
    expect(result.urls.length).toBeGreaterThan(0);
  });
});

describe('mergeSitemapWithCrawler helper function', () => {
  it('should merge URLs from crawler and sitemap', () => {
    const crawlerUrls = [
      'https://example.com/page1',
      'https://example.com/page2',
    ];

    const sitemapUrls = [
      'https://example.com/page2', // duplicate
      'https://example.com/page3',
      'https://example.com/page4',
    ];

    const merged = mergeSitemapWithCrawler(crawlerUrls, sitemapUrls, 'https://example.com');

    expect(merged.length).toBe(4);
    expect(merged).toContain('https://example.com/page1');
    expect(merged).toContain('https://example.com/page2');
    expect(merged).toContain('https://example.com/page3');
    expect(merged).toContain('https://example.com/page4');
  });

  it('should handle relative URLs', () => {
    const crawlerUrls = ['/page1', '/page2'];
    const sitemapUrls = ['https://example.com/page3'];

    const merged = mergeSitemapWithCrawler(crawlerUrls, sitemapUrls, 'https://example.com');

    expect(merged).toContain('https://example.com/page1');
    expect(merged).toContain('https://example.com/page2');
    expect(merged).toContain('https://example.com/page3');
  });

  it('should deduplicate URLs', () => {
    const crawlerUrls = ['https://example.com/page1', 'https://example.com/page1'];
    const sitemapUrls = ['https://example.com/page1'];

    const merged = mergeSitemapWithCrawler(crawlerUrls, sitemapUrls, 'https://example.com');

    expect(merged.length).toBe(1);
  });

  it('should handle invalid URLs gracefully', () => {
    const crawlerUrls = ['https://example.com/page1', 'invalid-url'];
    const sitemapUrls = ['https://example.com/page2', 'not-a-url'];

    const merged = mergeSitemapWithCrawler(crawlerUrls, sitemapUrls, 'https://example.com');

    // Valid absolute URLs should be included
    expect(merged).toContain('https://example.com/page1');
    expect(merged).toContain('https://example.com/page2');
    // Invalid URLs become relative URLs when resolved against base URL
    // 'invalid-url' becomes 'https://example.com/invalid-url'
    // 'not-a-url' becomes 'https://example.com/not-a-url'
    expect(merged.length).toBe(4);
  });
});

describe('XML parsing edge cases', () => {
  let parser: SitemapParser;

  beforeEach(() => {
    parser = new SitemapParser('https://example.com');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('should handle empty sitemap', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => `
        <?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        </urlset>
      `,
    })) as any;

    const result = await parser.parse();

    expect(result.urls.length).toBe(0);
  });

  it('should handle malformed XML', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => 'Not valid XML at all',
    })) as any;

    const result = await parser.parse();

    expect(result.urls.length).toBe(0);
  });

  it('should handle sitemap with special characters in URLs', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => `
        <urlset>
          <url><loc>https://example.com/page?query=1&amp;foo=bar</loc></url>
        </urlset>
      `,
    })) as any;

    const result = await parser.parse();

    expect(result.urls.length).toBeGreaterThan(0);
  });
});
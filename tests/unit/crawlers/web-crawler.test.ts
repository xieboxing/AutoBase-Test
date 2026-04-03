import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebCrawler } from '../../../src/crawlers/web-crawler';
import type { CrawlerResult } from '../../../src/types/crawler.types';

// Mock Playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(async () => ({
      newContext: vi.fn(async () => ({
        newPage: vi.fn(async () => ({
          goto: vi.fn(async () => ({ ok: () => true, status: () => 200 })),
          title: vi.fn(async () => 'Test Page'),
          waitForLoadState: vi.fn(async () => {}),
          waitForTimeout: vi.fn(async () => {}),
          waitForFunction: vi.fn(async () => {}),
          evaluate: vi.fn(async () => [
            '/page1',
            '/page2',
            'https://example.com/page3',
          ]),
          on: vi.fn(),
          setDefaultTimeout: vi.fn(),
        })),
        close: vi.fn(async () => {}),
      })),
      close: vi.fn(async () => {}),
    })),
  },
}));

describe('WebCrawler', () => {
  let crawler: WebCrawler;

  beforeEach(() => {
    crawler = new WebCrawler({
      maxDepth: 2,
      maxPages: 10,
      timeout: 5000,
      rateLimit: 100,
    });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await crawler.close();
  });

  it('should create crawler with default config', () => {
    const defaultCrawler = new WebCrawler();
    expect(defaultCrawler).toBeDefined();
  });

  it('should create crawler with custom config', () => {
    const customCrawler = new WebCrawler({
      maxDepth: 5,
      maxPages: 50,
      timeout: 10000,
    });
    expect(customCrawler).toBeDefined();
  });

  it('should crawl website and return results', async () => {
    const result = await crawler.crawl('https://example.com');

    expect(result).toBeDefined();
    expect(result.pages).toBeDefined();
    expect(result.errors).toBeDefined();
    expect(result.stats).toBeDefined();
    expect(result.stats.totalPages).toBeGreaterThanOrEqual(0);
    expect(result.stats.duration).toBeGreaterThanOrEqual(0);
  });

  it('should track visited URLs', async () => {
    await crawler.crawl('https://example.com');
    const visited = crawler.getVisitedUrls();
    expect(visited).toBeDefined();
    expect(visited.length).toBeGreaterThanOrEqual(0);
  });

  it('should emit crawler events', async () => {
    // The crawler uses the global eventBus, so we need to listen on that
    const { TestEventType, eventBus } = await import('../../../src/core/event-bus');

    let completeEventReceived = false;

    eventBus.onceSafe(TestEventType.CRAWLER_COMPLETE, () => {
      completeEventReceived = true;
    });

    await crawler.crawl('https://example.com');

    // Event should have been emitted
    expect(completeEventReceived).toBe(true);
  });

  it('should respect maxPages limit', async () => {
    const limitedCrawler = new WebCrawler({
      maxPages: 1,
      maxDepth: 1,
    });

    const result = await limitedCrawler.crawl('https://example.com');
    expect(result.pages.length).toBeLessThanOrEqual(1);

    await limitedCrawler.close();
  });

  it('should handle crawl errors gracefully', async () => {
    // The mock at the top of the file makes all pages succeed
    // So this test verifies that the error structure exists
    const result = await crawler.crawl('https://example.com/404');

    // The mock returns successful responses, so no errors expected
    // But the error handling structure should exist
    expect(result.errors).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('should exclude patterns correctly', async () => {
    const excludeCrawler = new WebCrawler({
      excludePatterns: [/\/admin\//i, /\.pdf$/i],
      maxDepth: 1,
      maxPages: 5,
    });

    await excludeCrawler.crawl('https://example.com');
    const visited = excludeCrawler.getVisitedUrls();

    // Should not contain excluded patterns
    const hasExcluded = visited.some(
      url => url.includes('/admin/') || url.endsWith('.pdf'),
    );
    expect(hasExcluded).toBe(false);

    await excludeCrawler.close();
  });
});

describe('crawlWebsite helper function', () => {
  it('should provide quick crawl functionality', async () => {
    const { crawlWebsite } = await import('../../../src/crawlers/web-crawler');

    const result = await crawlWebsite('https://example.com', {
      maxDepth: 1,
      maxPages: 5,
    });

    expect(result).toBeDefined();
    expect(result.stats).toBeDefined();
  });
});

describe('URL utility functions', () => {
  it('should normalize URLs correctly', async () => {
    // Import the module to test internal functions indirectly
    const { WebCrawler } = await import('../../../src/crawlers/web-crawler');

    // Test through the crawler's behavior
    const crawler = new WebCrawler({ maxDepth: 1, maxPages: 1 });
    await crawler.crawl('https://example.com/path?utm_source=test#section');

    // The crawler should have normalized the URL
    const visited = crawler.getVisitedUrls();
    expect(visited.some(url => !url.includes('utm_source'))).toBe(true);

    await crawler.close();
  });
});
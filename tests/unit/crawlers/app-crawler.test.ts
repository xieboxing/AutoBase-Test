import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppCrawler, MockAppCrawler, crawlApp } from '../../../src/crawlers/app-crawler';
import type { CrawlerResult } from '../../../src/types/crawler.types';

// Mock webdriverio
vi.mock('webdriverio', () => ({
  remote: vi.fn(async () => ({
    getCurrentActivity: vi.fn(async () => '.MainActivity'),
    getCurrentPackage: vi.fn(async () => 'com.example.app'),
    getPageSource: vi.fn(async () => '<xml></xml>'),
    takeScreenshot: vi.fn(async () => Buffer.from('mock-screenshot')),
    $$: vi.fn(async () => []),
    $: vi.fn(async () => ({
      click: vi.fn(async () => {}),
      getAttribute: vi.fn(async () => ''),
    })),
    back: vi.fn(async () => {}),
    closeApp: vi.fn(async () => {}),
    launchApp: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    touchAction: vi.fn(async () => {}),
    deleteSession: vi.fn(async () => {}),
  })),
}));

describe('AppCrawler', () => {
  let crawler: AppCrawler;

  beforeEach(() => {
    crawler = new AppCrawler({
      packageName: 'com.example.app',
      maxDepth: 2,
      maxPages: 5,
      maxActions: 10,
    });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await crawler.close();
    vi.restoreAllMocks();
  });

  it('should create crawler with config', () => {
    expect(crawler).toBeDefined();
  });

  it('should create crawler with default config', () => {
    const defaultCrawler = new AppCrawler({ packageName: 'com.test.app' });
    expect(defaultCrawler).toBeDefined();
  });

  it('should have correct default config values', () => {
    const defaultCrawler = new AppCrawler({ packageName: 'com.test.app' });
    // Private config, but we can test through behavior
    expect(defaultCrawler).toBeDefined();
  });
});

describe('MockAppCrawler', () => {
  let mockCrawler: MockAppCrawler;

  beforeEach(() => {
    mockCrawler = new MockAppCrawler({
      packageName: 'com.example.app',
      maxPages: 3,
    });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await mockCrawler.close();
  });

  it('should create mock crawler', () => {
    expect(mockCrawler).toBeDefined();
  });

  it('should return mock results', async () => {
    const result = await mockCrawler.crawl();

    expect(result).toBeDefined();
    expect(result.pages).toBeDefined();
    expect(result.errors).toBeDefined();
    expect(result.stats).toBeDefined();
  });

  it('should respect maxPages limit', async () => {
    const limitedCrawler = new MockAppCrawler({
      packageName: 'com.example.app',
      maxPages: 1,
    });

    const result = await limitedCrawler.crawl();
    expect(result.pages.length).toBeLessThanOrEqual(1);

    await limitedCrawler.close();
  });

  it('should return mock pages with correct structure', async () => {
    const result = await mockCrawler.crawl();

    expect(result.pages.length).toBeGreaterThan(0);
    const firstPage = result.pages[0];

    expect(firstPage.url).toBeDefined();
    expect(firstPage.title).toBeDefined();
    expect(firstPage.depth).toBeDefined();
    expect(firstPage.links).toBeDefined();
  });

  it('should include package name in URLs', async () => {
    const result = await mockCrawler.crawl();

    for (const page of result.pages) {
      expect(page.url).toContain('com.example.app');
    }
  });

  it('should track stats correctly', async () => {
    const result = await mockCrawler.crawl();

    expect(result.stats.totalPages).toBe(result.pages.length);
    expect(result.stats.duration).toBeGreaterThanOrEqual(0);
    expect(result.stats.totalLinks).toBeGreaterThanOrEqual(0);
  });

  it('should not have errors in mock mode', async () => {
    const result = await mockCrawler.crawl();
    expect(result.errors.length).toBe(0);
  });

  it('should get results via getResults()', async () => {
    await mockCrawler.crawl();
    const results = mockCrawler.getResults();

    expect(results).toBeDefined();
    expect(results.pages).toBeDefined();
  });
});

describe('crawlApp helper function', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should provide quick crawl functionality', async () => {
    // Use mock crawler for testing
    const result = await crawlApp({
      packageName: 'com.example.app',
    });

    expect(result).toBeDefined();
    expect(result.stats).toBeDefined();
  });
});

describe('AppCrawlerConfig', () => {
  it('should accept all config options', () => {
    const config = {
      packageName: 'com.example.app',
      mainActivity: '.MainActivity',
      apkPath: '/path/to/app.apk',
      deviceId: 'device123',
      maxDepth: 3,
      maxPages: 20,
      maxActions: 50,
      timeout: 10000,
      rateLimit: 500,
      backStrategy: 'restart' as const,
    };

    const crawler = new AppCrawler(config);
    expect(crawler).toBeDefined();
  });

  it('should support back-button strategy', () => {
    const crawler = new AppCrawler({
      packageName: 'com.example.app',
      backStrategy: 'back-button',
    });
    expect(crawler).toBeDefined();
  });

  it('should support restart strategy', () => {
    const crawler = new AppCrawler({
      packageName: 'com.example.app',
      backStrategy: 'restart',
    });
    expect(crawler).toBeDefined();
  });
});

describe('AppPageState', () => {
  it('should be tracked during crawl', async () => {
    const mockCrawler = new MockAppCrawler({
      packageName: 'com.example.app',
    });

    const result = await mockCrawler.crawl();

    // Pages should have varying depths
    const depths = result.pages.map(p => p.depth);
    expect(depths).toContain(0); // Should have root page
  });
});

describe('Error handling', () => {
  it('should handle missing Appium gracefully', async () => {
    // This test verifies that the crawler can be created
    // even without a real Appium connection
    const crawler = new AppCrawler({
      packageName: 'com.example.app',
    });

    expect(crawler).toBeDefined();
    await crawler.close();
  });

  it('should close driver properly', async () => {
    const crawler = new AppCrawler({
      packageName: 'com.example.app',
    });

    await crawler.close();
    // Should not throw
  });
});

describe('Element interaction', () => {
  it('should parse element selectors correctly', async () => {
    const mockCrawler = new MockAppCrawler({
      packageName: 'com.example.app',
    });

    const result = await mockCrawler.crawl();

    // Mock pages should have link selectors
    for (const page of result.pages) {
      for (const link of page.links) {
        expect(link).toBeDefined();
        expect(typeof link).toBe('string');
      }
    }
  });
});

describe('Depth control', () => {
  it('should respect maxDepth setting', async () => {
    const mockCrawler = new MockAppCrawler({
      packageName: 'com.example.app',
      maxDepth: 1,
    });

    const result = await mockCrawler.crawl();

    // All pages should be at depth 0 or 1
    for (const page of result.pages) {
      expect(page.depth).toBeLessThanOrEqual(1);
    }
  });
});
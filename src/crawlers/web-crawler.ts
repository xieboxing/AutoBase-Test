import { chromium, type Browser, type Page } from 'playwright';
import { EventEmitter } from 'node:events';
import type {
  CrawlerConfig,
  CrawlerResult,
  CrawledPage,
  CrawlerError,
} from '@/types/crawler.types.js';
import { logger } from '@/core/logger.js';
import { TestEventType, eventBus } from '@/core/event-bus.js';

/**
 * 默认爬虫配置
 */
const DEFAULT_CONFIG: CrawlerConfig = {
  maxDepth: 3,
  maxPages: 100,
  timeout: 30000,
  rateLimit: 500, // 每次请求间隔 500ms
  excludePatterns: [
    // 静态资源
    /\.(png|jpg|jpeg|gif|svg|webp|ico|bmp)$/i,
    /\.(mp4|webm|mp3|wav|ogg|avi)$/i,
    /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z|tar|gz)$/i,
    /\.(css|js|ts|map)$/i,
    // 常见排除路径
    /\/api\//i,
    /\/static\//i,
    /\/assets\//i,
    /\/cdn\//i,
    /\/files\//i,
    /\/downloads\//i,
    /\/uploads\//i,
    // 认证相关
    /\/login/i,
    /\/logout/i,
    /\/register/i,
    /\/signup/i,
    /\/signin/i,
    /\/auth\//i,
    /\/oauth\//i,
    // 管理后台
    /\/admin\//i,
    /\/dashboard\//i,
    /\/console\//i,
  ],
  followExternalLinks: false,
};

/**
 * URL 处理工具函数
 */
function normalizeUrl(url: string, baseUrl: string): string | null {
  try {
    const absoluteUrl = new URL(url, baseUrl);

    // 移除 hash 和查询参数中的追踪参数
    absoluteUrl.hash = '';
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
    trackingParams.forEach(param => absoluteUrl.searchParams.delete(param));

    return absoluteUrl.href;
  } catch {
    return null;
  }
}

function isExternalUrl(url: string, baseUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const target = new URL(url, baseUrl);
    return base.hostname !== target.hostname;
  } catch {
    return true;
  }
}

function shouldExclude(url: string, patterns: (string | RegExp)[]): boolean {
  return patterns.some(pattern => {
    if (typeof pattern === 'string') {
      return url.includes(pattern);
    }
    return pattern.test(url);
  });
}

/**
 * Web 爬虫类
 */
export class WebCrawler extends EventEmitter {
  private config: CrawlerConfig;
  private browser: Browser | null = null;
  private visitedUrls: Set<string> = new Set();
  private pages: CrawledPage[] = [];
  private errors: CrawlerError[] = [];
  private baseUrl: string = '';
  private startTime: number = 0;

  constructor(config: Partial<CrawlerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 爬取网站
   */
  async crawl(startUrl: string): Promise<CrawlerResult> {
    this.baseUrl = startUrl;
    this.startTime = Date.now();
    this.visitedUrls.clear();
    this.pages = [];
    this.errors = [];

    logger.info('🚀 启动 Web 爬虫', {
      url: startUrl,
      maxDepth: this.config.maxDepth,
      maxPages: this.config.maxPages,
    });

    eventBus.emitSafe(TestEventType.CRAWLER_START, {
      url: startUrl,
      depth: this.config.maxDepth,
    });

    // 启动浏览器
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--no-sandbox',
      ],
    });

    try {
      // BFS 爬取
      await this.crawlBfs(startUrl);

      const duration = Date.now() - this.startTime;

      logger.info('✅ 爬虫完成', {
        totalPages: this.pages.length,
        totalErrors: this.errors.length,
        durationMs: duration,
      });

      eventBus.emitSafe(TestEventType.CRAWLER_COMPLETE, {
        totalPages: this.pages.length,
        durationMs: duration,
      });

      return {
        pages: this.pages,
        errors: this.errors,
        stats: {
          totalPages: this.pages.length,
          totalLinks: this.pages.reduce((sum, p) => sum + p.links.length, 0),
          duration,
        },
      };
    } finally {
      await this.close();
    }
  }

  /**
   * BFS 广度优先爬取
   */
  private async crawlBfs(startUrl: string): Promise<void> {
    const queue: Array<{ url: string; depth: number; parentUrl?: string }> = [
      { url: startUrl, depth: 0 },
    ];

    while (queue.length > 0 && this.pages.length < this.config.maxPages) {
      const { url, depth, parentUrl } = queue.shift()!;

      // 检查是否超过深度限制
      if (depth > this.config.maxDepth) {
        continue;
      }

      // 检查是否已访问
      const normalizedUrl = normalizeUrl(url, this.baseUrl);
      if (!normalizedUrl || this.visitedUrls.has(normalizedUrl)) {
        continue;
      }

      // 检查是否应排除
      if (shouldExclude(normalizedUrl, this.config.excludePatterns)) {
        continue;
      }

      // 检查是否是外链（如果配置不允许）
      if (!this.config.followExternalLinks && isExternalUrl(normalizedUrl, this.baseUrl)) {
        continue;
      }

      // 标记为已访问
      this.visitedUrls.add(normalizedUrl);

      // 限速
      if (this.config.rateLimit > 0) {
        await this.delay(this.config.rateLimit);
      }

      // 爬取页面
      const result = await this.crawlPage(normalizedUrl, depth, parentUrl);

      if (result) {
        this.pages.push(result);

        // 将发现的链接加入队列
        for (const link of result.links) {
          const normalizedLink = normalizeUrl(link, this.baseUrl);
          if (normalizedLink && !this.visitedUrls.has(normalizedLink)) {
            queue.push({ url: normalizedLink, depth: depth + 1, parentUrl: normalizedUrl });
          }
        }
      }
    }
  }

  /**
   * 爬取单个页面
   */
  private async crawlPage(
    url: string,
    depth: number,
    parentUrl?: string,
  ): Promise<CrawledPage | null> {
    const context = await this.browser!.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();

    try {
      logger.step(`📍 爬取页面 (深度 ${depth})`, { url });

      // 设置超时
      page.setDefaultTimeout(this.config.timeout);

      // 监听 SPA 路由变化
      const routeChanges: string[] = [];
      await this.setupSpaListener(page, routeChanges);

      // 导航到页面
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: this.config.timeout,
      });

      if (!response || !response.ok()) {
        const status = response?.status() ?? 0;
        throw new Error(`页面加载失败: HTTP ${status}`);
      }

      // 等待页面稳定
      await page.waitForLoadState('domcontentloaded');
      await this.waitForSpaStable(page);

      // 获取页面信息
      const title = await page.title();
      const links = await this.extractLinks(page);

      eventBus.emitSafe(TestEventType.CRAWLER_PAGE, {
        url,
        title,
        depth,
      });

      logger.pass('✅ 页面爬取成功', {
        url,
        title,
        linksFound: links.length,
      });

      return {
        url,
        title,
        depth,
        links,
        parentUrl,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.fail('❌ 页面爬取失败', { url, error: errorMessage });

      this.errors.push({
        url,
        error: errorMessage,
        code: 'CRAWL_FAILED',
        timestamp: new Date().toISOString(),
      });

      eventBus.emitSafe(TestEventType.CRAWLER_ERROR, {
        url,
        error: error instanceof Error ? error : new Error(errorMessage),
      });

      return null;
    } finally {
      await context.close();
    }
  }

  /**
   * 设置 SPA 路由监听器
   */
  private async setupSpaListener(page: Page, _routeChanges: string[]): Promise<void> {
    // 监听 pushState 和 replaceState（在浏览器上下文中执行）
    await page.evaluate(() => {
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;

      history.pushState = function (data: unknown, unused: string, url?: string | URL | null) {
        originalPushState.call(this, data, unused, url);
        window.dispatchEvent(new CustomEvent('pushstate'));
      };

      history.replaceState = function (data: unknown, unused: string, url?: string | URL | null) {
        originalReplaceState.call(this, data, unused, url);
        window.dispatchEvent(new CustomEvent('replacestate'));
      };
    });

    // 监听自定义事件
    page.on('console', msg => {
      if (msg.type() === 'log' && msg.text().includes('route change')) {
        _routeChanges.push(msg.text());
      }
    });
  }

  /**
   * 等待 SPA 页面稳定
   */
  private async waitForSpaStable(page: Page): Promise<void> {
    // 等待一段时间确保 SPA 内容加载
    await page.waitForTimeout(500);

    // 检查是否有 pending 的网络请求或 loading 状态
    try {
      await page.waitForFunction(
        () => {
          // 检查 document.readyState
          if (document.readyState !== 'complete') {
            return false;
          }

          // 检查是否有 loading 状态的元素
          const loadingElements = document.querySelectorAll('[data-loading="true"], .loading, .spinner, [aria-busy="true"]');
          return loadingElements.length === 0;
        },
        { timeout: 5000 },
      );
    } catch {
      // 超时不影响继续执行，页面可能已经稳定
      logger.debug('SPA 页面稳定检查超时，继续执行');
    }
  }

  /**
   * 提取页面链接
   */
  private async extractLinks(page: Page): Promise<string[]> {
    const links: string[] = [];

    // 提取 <a> 标签的 href
    const anchorLinks = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      return anchors.map(a => {
        const href = a.getAttribute('href') || '';
        // 忽略空链接和 javascript 链接
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
          return null;
        }
        return href;
      }).filter(Boolean) as string[];
    });
    links.push(...anchorLinks);

    // 提取 <area> 标签（地图链接）
    const areaLinks = await page.evaluate(() => {
      const areas = Array.from(document.querySelectorAll('area[href]'));
      return areas.map(area => area.getAttribute('href') || '').filter(Boolean) as string[];
    });
    links.push(...areaLinks);

    // 提取 Vue/React/Angular SPA 路由链接（data-href, to, router-link 等）
    const spaLinks = await page.evaluate(() => {
      const spaElements = Array.from(document.querySelectorAll('[data-href], [to], router-link, a[data-router]'));
      return spaElements.map(el => {
        const href = el.getAttribute('data-href') || el.getAttribute('to') || el.getAttribute('href') || '';
        return href || null;
      }).filter(Boolean) as string[];
    });
    links.push(...spaLinks);

    // 去重
    return Array.from(new Set(links));
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        logger.warn('关闭爬虫浏览器失败', { error: String(error) });
      } finally {
        this.browser = null;
      }
    }
  }

  /**
   * 获取已访问的 URL 列表
   */
  getVisitedUrls(): string[] {
    return Array.from(this.visitedUrls);
  }

  /**
   * 获取爬取结果
   */
  getResults(): CrawlerResult {
    return {
      pages: this.pages,
      errors: this.errors,
      stats: {
        totalPages: this.pages.length,
        totalLinks: this.pages.reduce((sum, p) => sum + p.links.length, 0),
        duration: Date.now() - this.startTime,
      },
    };
  }
}

/**
 * 快捷爬取函数
 */
export async function crawlWebsite(
  url: string,
  options?: Partial<CrawlerConfig>,
): Promise<CrawlerResult> {
  const crawler = new WebCrawler(options);
  return crawler.crawl(url);
}
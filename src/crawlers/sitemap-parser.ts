import { logger } from '@/core/logger.js';

/**
 * Sitemap 解析结果
 */
export interface SitemapParseResult {
  urls: string[];
  sources: string[];
  errors: string[];
}

/**
 * Sitemap URL 信息
 */
export interface SitemapUrlInfo {
  url: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

/**
 * Sitemap 解析器类
 */
export class SitemapParser {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string, timeout: number = 10000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * 解析网站的 sitemap
   */
  async parse(): Promise<SitemapParseResult> {
    logger.step('🗺️ 开始解析 Sitemap', { baseUrl: this.baseUrl });

    const result: SitemapParseResult = {
      urls: [],
      sources: [],
      errors: [],
    };

    // 尝试从 robots.txt 获取 sitemap 地址
    const robotsSitemaps = await this.parseRobotsTxt();

    if (robotsSitemaps.length > 0) {
      logger.info('📋 从 robots.txt 发现 Sitemap', { count: robotsSitemaps.length });

      for (const sitemapUrl of robotsSitemaps) {
        const urls = await this.parseSitemapUrl(sitemapUrl);
        if (urls.length > 0) {
          result.urls.push(...urls);
          result.sources.push(sitemapUrl);
        } else {
          result.errors.push(`Sitemap ${sitemapUrl} 解析失败或为空`);
        }
      }
    }

    // 尝试默认的 sitemap.xml
    const defaultSitemapUrl = new URL('/sitemap.xml', this.baseUrl).href;
    if (!result.sources.includes(defaultSitemapUrl)) {
      const urls = await this.parseSitemapUrl(defaultSitemapUrl);
      if (urls.length > 0) {
        result.urls.push(...urls);
        result.sources.push(defaultSitemapUrl);
        logger.info('📋 从默认 sitemap.xml 发现 URL', { count: urls.length });
      }
    }

    // 尝试其他常见 sitemap 位置
    const commonSitemaps = [
      '/sitemap_index.xml',
      '/sitemap-posts.xml',
      '/sitemap-pages.xml',
      '/sitemap-images.xml',
      '/sitemap-news.xml',
    ];

    for (const sitemap of commonSitemaps) {
      const sitemapUrl = new URL(sitemap, this.baseUrl).href;
      if (!result.sources.includes(sitemapUrl)) {
        const urls = await this.parseSitemapUrl(sitemapUrl);
        if (urls.length > 0) {
          result.urls.push(...urls);
          result.sources.push(sitemapUrl);
        }
      }
    }

    // 去重
    result.urls = Array.from(new Set(result.urls));

    logger.pass('✅ Sitemap 解析完成', {
      totalUrls: result.urls.length,
      sources: result.sources.length,
      errors: result.errors.length,
    });

    return result;
  }

  /**
   * 解析 robots.txt 获取 sitemap 地址
   */
  private async parseRobotsTxt(): Promise<string[]> {
    const robotsUrl = new URL('/robots.txt', this.baseUrl).href;

    try {
      logger.step('📍 获取 robots.txt', { url: robotsUrl });

      const response = await fetch(robotsUrl, {
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        logger.warn('⚠️ robots.txt 获取失败', { status: response.status });
        return [];
      }

      const content = await response.text();
      const sitemaps: string[] = [];

      // 解析 Sitemap 行
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.toLowerCase().startsWith('sitemap:')) {
          const sitemapUrl = trimmedLine.substring(8).trim();
          if (sitemapUrl) {
            // 验证 URL 是否有效
            try {
              new URL(sitemapUrl);
              sitemaps.push(sitemapUrl);
            } catch {
              // URL 无效，跳过
            }
          }
        }
      }

      return sitemaps;
    } catch (error) {
      logger.warn('⚠️ robots.txt 解析失败', { error: String(error) });
      return [];
    }
  }

  /**
   * 解析 sitemap.xml URL
   */
  private async parseSitemapUrl(sitemapUrl: string): Promise<string[]> {
    try {
      logger.step('📍 解析 Sitemap', { url: sitemapUrl });

      const response = await fetch(sitemapUrl, {
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        return [];
      }

      const content = await response.text();
      return this.parseSitemapXmlAsync(content);
    } catch (error) {
      logger.warn('⚠️ Sitemap 解析失败', { url: sitemapUrl, error: String(error) });
      return [];
    }
  }

  /**
   * 解析 sitemap XML 内容（异步版本，支持递归解析子 sitemap）
   */
  private async parseSitemapXmlAsync(xml: string): Promise<string[]> {
    const urls: string[] = [];

    try {
      // 简单的 XML 解析（不依赖外部库）
      // 匹配 <url> 标签中的 <loc>

      // 检查是否是 sitemap index（包含其他 sitemap）
      const sitemapMatches = xml.match(/<sitemap[^>]*>[\s\S]*?<loc[^>]*>([^<]+)<\/loc[\s\S]*?<\/sitemap>/gi);
      if (sitemapMatches) {
        // 这是一个 sitemap index，需要递归解析
        for (const match of sitemapMatches) {
          const locMatch = match.match(/<loc[^>]*>([^<]+)<\/loc/i);
          if (locMatch && locMatch[1]) {
            const childSitemapUrl = locMatch[1].trim();
            // 递归解析子 sitemap
            const childUrls = await this.parseSitemapUrl(childSitemapUrl);
            urls.push(...childUrls);
          }
        }
      }

      // 匹配普通 URL
      const urlMatches = xml.match(/<url[^>]*>[\s\S]*?<loc[^>]*>([^<]+)<\/loc[\s\S]*?<\/url>/gi);
      if (urlMatches) {
        for (const match of urlMatches) {
          const locMatch = match.match(/<loc[^>]*>([^<]+)<\/loc/i);
          if (locMatch && locMatch[1]) {
            urls.push(locMatch[1].trim());
          }
        }
      }
    } catch (error) {
      logger.warn('⚠️ XML 解析失败', { error: String(error) });
    }

    return urls;
  }

  /**
   * 获取详细的 URL 信息（包含 lastmod, changefreq, priority）
   */
  async parseDetailed(): Promise<SitemapUrlInfo[]> {
    logger.step('🗺️ 解析详细 Sitemap 信息', { baseUrl: this.baseUrl });

    const result: SitemapUrlInfo[] = [];

    // 获取 sitemap URLs
    const sitemapUrls = await this.getSitemapUrls();

    for (const sitemapUrl of sitemapUrls) {
      try {
        const response = await fetch(sitemapUrl, {
          signal: AbortSignal.timeout(this.timeout),
        });

        if (!response.ok) continue;

        const xml = await response.text();
        const urlInfos = this.parseSitemapXmlDetailed(xml);
        result.push(...urlInfos);
      } catch (error) {
        logger.warn('⚠️ Sitemap 解析失败', { url: sitemapUrl, error: String(error) });
      }
    }

    return result;
  }

  /**
   * 获取所有 sitemap URL 地址
   */
  private async getSitemapUrls(): Promise<string[]> {
    const sitemapUrls: string[] = [];

    // 从 robots.txt 获取
    const robotsSitemaps = await this.parseRobotsTxt();
    sitemapUrls.push(...robotsSitemaps);

    // 默认 sitemap.xml
    const defaultSitemap = new URL('/sitemap.xml', this.baseUrl).href;
    if (!sitemapUrls.includes(defaultSitemap)) {
      sitemapUrls.push(defaultSitemap);
    }

    return sitemapUrls;
  }

  /**
   * 解析详细的 sitemap XML
   */
  private parseSitemapXmlDetailed(xml: string): SitemapUrlInfo[] {
    const result: SitemapUrlInfo[] = [];

    // 匹配 <url> 标签
    const urlMatches = xml.match(/<url[^>]*>[\s\S]*?<\/url>/gi);
    if (!urlMatches) return result;

    for (const urlBlock of urlMatches) {
      const urlInfo: SitemapUrlInfo = { url: '' };

      // 提取 loc
      const locMatch = urlBlock.match(/<loc[^>]*>([^<]+)<\/loc/i);
      if (locMatch && locMatch[1]) {
        urlInfo.url = locMatch[1].trim();
      }

      // 提取 lastmod
      const lastmodMatch = urlBlock.match(/<lastmod[^>]*>([^<]+)<\/lastmod/i);
      if (lastmodMatch && lastmodMatch[1]) {
        urlInfo.lastmod = lastmodMatch[1].trim();
      }

      // 提取 changefreq
      const changefreqMatch = urlBlock.match(/<changefreq[^>]*>([^<]+)<\/changefreq/i);
      if (changefreqMatch && changefreqMatch[1]) {
        urlInfo.changefreq = changefreqMatch[1].trim();
      }

      // 提取 priority
      const priorityMatch = urlBlock.match(/<priority[^>]*>([^<]+)<\/priority/i);
      if (priorityMatch && priorityMatch[1]) {
        urlInfo.priority = parseFloat(priorityMatch[1].trim());
      }

      if (urlInfo.url) {
        result.push(urlInfo);
      }
    }

    return result;
  }

  /**
   * 合并爬虫结果和 sitemap 结果
   */
  static mergeResults(
    crawlerUrls: string[],
    sitemapUrls: string[],
    baseUrl: string,
  ): string[] {
    const merged = new Set<string>();

    // 规范化并添加爬虫 URL
    for (const url of crawlerUrls) {
      try {
        const normalized = new URL(url, baseUrl).href;
        merged.add(normalized);
      } catch {
        // URL 无效，跳过
      }
    }

    // 规范化并添加 sitemap URL
    for (const url of sitemapUrls) {
      try {
        const normalized = new URL(url, baseUrl).href;
        merged.add(normalized);
      } catch {
        // URL 无效，跳过
      }
    }

    return Array.from(merged);
  }
}

/**
 * 快捷解析函数
 */
export async function parseSitemap(
  baseUrl: string,
  timeout?: number,
): Promise<SitemapParseResult> {
  const parser = new SitemapParser(baseUrl, timeout);
  return parser.parse();
}

/**
 * 快捷合并函数
 */
export function mergeSitemapWithCrawler(
  crawlerUrls: string[],
  sitemapUrls: string[],
  baseUrl: string,
): string[] {
  return SitemapParser.mergeResults(crawlerUrls, sitemapUrls, baseUrl);
}
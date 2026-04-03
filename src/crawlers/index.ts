// Web 爬虫
export { WebCrawler, crawlWebsite } from './web-crawler.js';

// 页面快照
export {
  PageSnapshotter,
  takePageSnapshot,
  snapshotUrl,
} from './page-snapshot.js';
export type { SnapshotConfig } from './page-snapshot.js';

// Sitemap 解析器
export {
  SitemapParser,
  parseSitemap,
  mergeSitemapWithCrawler,
} from './sitemap-parser.js';
export type { SitemapParseResult, SitemapUrlInfo } from './sitemap-parser.js';

// APP 爬虫
export {
  AppCrawler,
  crawlApp,
  MockAppCrawler,
} from './app-crawler.js';
export type { AppCrawlerConfig, AppPageState } from './app-crawler.js';

// 类型导出
export type {
  CrawlerConfig,
  CrawlerResult,
  CrawledPage,
  CrawlerError,
  PageSnapshot,
  InteractiveElement,
  FormInfo,
  FormField,
  NetworkRequest,
} from '@/types/crawler.types.js';
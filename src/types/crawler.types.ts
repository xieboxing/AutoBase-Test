/**
 * 页面快照
 */
export interface PageSnapshot {
  url: string;
  title: string;
  timestamp: string;
  screenshot: {
    fullPage: string;
    viewport: string;
  };
  html: string;
  interactiveElements: InteractiveElement[];
  forms: FormInfo[];
  networkRequests: NetworkRequest[];
  metadata: {
    loadTime: number;
    domNodes: number;
    scripts: number;
    stylesheets: number;
  };
}

/**
 * 可交互元素
 */
export interface InteractiveElement {
  tag: string;
  text?: string;
  selector: string;
  alternativeSelectors: string[];
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  visible: boolean;
  clickable: boolean;
  disabled: boolean;
  attributes: Record<string, string>;
  type?: string;
  value?: string;
}

/**
 * 表单信息
 */
export interface FormInfo {
  selector: string;
  action?: string;
  method?: string;
  fields: FormField[];
}

/**
 * 表单字段
 */
export interface FormField {
  selector: string;
  type: string;
  name?: string;
  label?: string;
  required: boolean;
  placeholder?: string;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
  };
}

/**
 * 网络请求
 */
export interface NetworkRequest {
  url: string;
  method: string;
  status: number;
  type: 'api' | 'script' | 'stylesheet' | 'image' | 'font' | 'other';
  timing: {
    startTime: number;
    endTime: number;
    duration: number;
  };
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
}

/**
 * 爬虫配置
 */
export interface CrawlerConfig {
  maxDepth: number;
  maxPages: number;
  timeout: number;
  rateLimit: number;
  excludePatterns: (string | RegExp)[];
  includePatterns?: (string | RegExp)[];
  followExternalLinks: boolean;
}

/**
 * 爬虫结果
 */
export interface CrawlerResult {
  pages: CrawledPage[];
  errors: CrawlerError[];
  stats: {
    totalPages: number;
    totalLinks: number;
    duration: number;
  };
}

/**
 * 爬取的页面
 */
export interface CrawledPage {
  url: string;
  title: string;
  depth: number;
  snapshot?: PageSnapshot;
  links: string[];
  parentUrl?: string;
}

/**
 * 爬虫错误
 */
export interface CrawlerError {
  url: string;
  error: string;
  code: string;
  timestamp: string;
}
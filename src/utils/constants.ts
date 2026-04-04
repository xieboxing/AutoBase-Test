/**
 * 全局常量定义
 * 集中管理所有硬编码值，便于维护和修改
 */

/**
 * 默认路径配置
 */
export const DEFAULT_PATHS = {
  /** 数据目录 */
  dataDir: './data',
  /** 截图目录 */
  screenshotsDir: './data/screenshots',
  /** 视频目录 */
  videosDir: './data/videos',
  /** 报告目录 */
  reportsDir: './data/reports',
  /** 日志目录 */
  logsDir: './data/logs',
  /** 数据库目录 */
  dbDir: './db',
  /** 数据库文件路径 */
  dbPath: './db/sqlite.db',
  /** 状态图谱目录 */
  stateGraphsDir: './data/state-graphs',
  /** 性能数据目录 */
  performanceDir: './data/performance',
  /** 测试套件目录 */
  testSuitesDir: './test-suites',
} as const;

/**
 * 默认网络配置
 */
export const DEFAULT_NETWORK = {
  /** Appium 默认主机 */
  appiumHost: '127.0.0.1',
  /** Appium 默认端口 */
  appiumPort: 4723,
  /** Appium 默认路径 */
  appiumPath: '/wd/hub',
  /** 默认超时时间（毫秒） */
  defaultTimeout: 30000,
  /** 网络请求超时（毫秒） */
  networkTimeout: 60000,
  /** 页面加载超时（毫秒） */
  pageLoadTimeout: 30000,
} as const;

/**
 * 默认浏览器配置
 */
export const DEFAULT_BROWSER = {
  /** 默认浏览器类型 */
  browser: 'chromium' as const,
  /** 默认视口宽度 */
  viewportWidth: 1920,
  /** 默认视口高度 */
  viewportHeight: 1080,
  /** 移动端视口宽度 */
  mobileViewportWidth: 375,
  /** 移动端视口高度 */
  mobileViewportHeight: 667,
  /** 默认设备 */
  defaultDevice: 'iPhone 15',
} as const;

/**
 * 默认测试配置
 */
export const DEFAULT_TEST = {
  /** 默认测试深度 */
  maxDepth: 3,
  /** 默认最大页面数 */
  maxPages: 20,
  /** 默认重试次数 */
  retryCount: 2,
  /** 默认并行度 */
  parallelism: 1,
  /** 默认爬虫间隔（毫秒） */
  rateLimit: 500,
  /** 默认采集持续时间（秒） */
  performanceDuration: 60,
  /** 默认采集间隔（毫秒） */
  performanceInterval: 1000,
} as const;

/**
 * 默认用户代理
 */
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * 浏览器启动参数
 */
export const BROWSER_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-sandbox',
  '--disable-dev-shm-usage',
];

/**
 * 爬虫排除模式
 */
export const CRAWLER_EXCLUDE_PATTERNS = [
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
] as const;

/**
 * 追踪参数列表
 */
export const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
] as const;

/**
 * 默认视口配置
 */
export const DEFAULT_VIEWPORT = {
  width: DEFAULT_BROWSER.viewportWidth,
  height: DEFAULT_BROWSER.viewportHeight,
} as const;

/**
 * 移动端默认视口配置
 */
export const MOBILE_VIEWPORT = {
  width: DEFAULT_BROWSER.mobileViewportWidth,
  height: DEFAULT_BROWSER.mobileViewportHeight,
} as const;
import { devices, type BrowserContextOptions as DeviceDescriptor } from '@playwright/test';
import { PcTester, type PcTesterConfig } from './pc-tester.js';
import type { TestCase, TestStep } from '@/types/test-case.types.js';
import type { TestCaseResult } from '@/types/test-result.types.js';
import { logger } from '@/core/logger.js';
import { devices as devicePresets } from '@config/devices.config.js';

/**
 * 设备名称类型
 */
export type DeviceName = keyof typeof devices | string;

/**
 * H5 移动端测试器配置
 */
export interface H5TesterConfig extends Omit<PcTesterConfig, 'viewport'> {
  device: DeviceName;
  touchEnabled: boolean;
  emulateGeolocation?: {
    latitude: number;
    longitude: number;
  };
  emulateOffline?: boolean;
}

/**
 * 默认 H5 配置
 */
const DEFAULT_H5_TESTER_CONFIG: H5TesterConfig = {
  browser: 'chromium',
  device: 'iPhone 14',
  touchEnabled: true,
  headless: true,
  slowMo: 0,
  timeout: 30000,
  screenshotOnStep: false,
  screenshotOnFailure: true,
  videoOnFailure: true,
  artifactsDir: './data/screenshots',
};

/**
 * H5 移动端 Web 测试器
 */
export class H5Tester extends PcTester {
  protected h5Config: H5TesterConfig;
  protected deviceDescriptor: DeviceDescriptor | null = null;

  constructor(config: Partial<H5TesterConfig> = {}) {
    // 不传递 viewport，因为由设备决定
    const { viewport: _viewport, ...pcConfig } = config as Omit<H5TesterConfig, 'viewport'> & { viewport?: unknown };
    super(pcConfig as Partial<PcTesterConfig>);
    this.h5Config = { ...DEFAULT_H5_TESTER_CONFIG, ...config };
  }

  /**
   * 初始化浏览器
   */
  override async initialize(): Promise<void> {
    logger.info('🚀 初始化移动端浏览器', { device: this.h5Config.device, headless: this.h5Config.headless });

    // 获取设备配置
    this.deviceDescriptor = this.getDeviceDescriptor(this.h5Config.device);

    // 确保截图目录存在
    const fs = await import('node:fs/promises');
    await fs.mkdir(this.h5Config.artifactsDir, { recursive: true });

    const browserType = this.getBrowserType();

    this.browser = await browserType.launch({
      headless: this.h5Config.headless,
      slowMo: this.h5Config.slowMo,
    });

    // 使用设备配置创建上下文
    this.context = await this.browser.newContext({
      ...this.deviceDescriptor,
      recordVideo: this.h5Config.videoOnFailure
        ? { dir: this.h5Config.artifactsDir }
        : undefined,
      geolocation: this.h5Config.emulateGeolocation,
      offline: this.h5Config.emulateOffline,
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.h5Config.timeout);

    logger.pass('✅ 移动端浏览器初始化完成', {
      device: this.h5Config.device,
      viewport: this.deviceDescriptor.viewport,
    });
  }

  /**
   * 获取设备配置
   */
  protected getDeviceDescriptor(deviceName: DeviceName): DeviceDescriptor {
    // 先检查 Playwright 内置设备
    const builtinDevice = devices[deviceName as keyof typeof devices];
    if (builtinDevice) {
      return builtinDevice;
    }

    // 再检查自定义预设设备
    const customDevice = devicePresets.find(d => d.name === deviceName);
    if (customDevice) {
      return {
        userAgent: customDevice.userAgent,
        viewport: customDevice.viewport,
        deviceScaleFactor: customDevice.deviceScaleFactor,
        isMobile: true,
        hasTouch: true,
      };
    }

    // 默认使用 iPhone 14
    logger.warn(`⚠️ 设备 "${deviceName}" 未找到，使用默认 iPhone 14`);
    return devices['iPhone 14'] ?? {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    };
  }

  /**
   * 执行动作 - 重写以支持移动端特有操作
   */
  protected override async executeAction(step: TestStep): Promise<void> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const timeout = step.timeout || this.h5Config.timeout;

    switch (step.action) {
      case 'tap':
        await this.tap(step.target || '', timeout);
        break;

      case 'swipe':
        await this.swipe(step.target, step.value || '');
        break;

      case 'long-press':
        await this.longPress(step.target || '', timeout);
        break;

      default:
        // 其他操作使用父类实现
        await super.executeAction(step);
    }
  }

  /**
   * 点击（移动端使用 tap）
   */
  protected override async click(selector: string, timeout: number): Promise<void> {
    await this.tap(selector, timeout);
  }

  /**
   * 触摸点击
   */
  protected async tap(selector: string, timeout: number): Promise<void> {
    if (!this.page) return;
    logger.step(`👆 触摸点击: ${selector}`);
    await this.page.tap(selector, { timeout });
  }

  /**
   * 滑动
   */
  protected async swipe(selector?: string, direction?: string): Promise<void> {
    if (!this.page) return;

    logger.step(`👋 滑动: ${direction || 'up'}`);

    const viewport = this.page.viewportSize();
    if (!viewport) {
      logger.warn('⚠️ 无法获取视口尺寸，跳过滑动操作');
      return;
    }

    let startX = viewport.width / 2;
    let startY = viewport.height / 2;
    let endX = startX;
    let endY = startY;

    // 根据方向设置滑动坐标
    switch (direction?.toLowerCase()) {
      case 'up':
        startY = viewport.height * 0.8;
        endY = viewport.height * 0.2;
        break;
      case 'down':
        startY = viewport.height * 0.2;
        endY = viewport.height * 0.8;
        break;
      case 'left':
        startX = viewport.width * 0.8;
        endX = viewport.width * 0.2;
        break;
      case 'right':
        startX = viewport.width * 0.2;
        endX = viewport.width * 0.8;
        break;
    }

    if (selector) {
      // 在指定元素上滑动
      const element = this.page.locator(selector);
      const box = await element.boundingBox();
      if (box) {
        startX = box.x + box.width / 2;
        startY = box.y + box.height / 2;
      }
    }

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(endX, endY, { steps: 10 });
    await this.page.mouse.up();
  }

  /**
   * 长按
   */
  protected async longPress(selector: string, _timeout: number): Promise<void> {
    if (!this.page) return;
    logger.step(`👆 长按: ${selector}`);

    const element = this.page.locator(selector);
    const box = await element.boundingBox();
    if (!box) {
      throw new Error(`Element ${selector} not found`);
    }

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await this.page.mouse.move(x, y);
    await this.page.mouse.down();
    await this.page.waitForTimeout(500); // 长按 500ms
    await this.page.mouse.up();
  }

  /**
   * 测试视口适配
   */
  async testViewportAdaptation(): Promise<{
    hasHorizontalScroll: boolean;
    overflowElements: string[];
  }> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const result = await this.page.evaluate(() => {
      const hasHorizontalScroll = document.body.scrollWidth > window.innerWidth;
      const overflowElements: string[] = [];

      // 查找溢出元素
      document.querySelectorAll('*').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.right > window.innerWidth || rect.left < 0) {
          overflowElements.push(el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.className ? `.${el.className.split(' ')[0]}` : ''));
        }
      });

      return { hasHorizontalScroll, overflowElements: [...new Set(overflowElements)].slice(0, 20) };
    });

    return result;
  }

  /**
   * 测试触摸目标大小
   */
  async testTouchTargets(): Promise<{
    smallTargets: Array<{ selector: string; width: number; height: number }>;
  }> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const minTouchSize = 44; // iOS 人机界面指南推荐最小 44x44

    const result = await this.page.evaluate((minSize) => {
      const smallTargets: Array<{ selector: string; width: number; height: number }> = [];

      // 检查所有可点击元素
      const clickableSelectors = 'a, button, input, select, textarea, [role="button"], [onclick]';
      document.querySelectorAll(clickableSelectors).forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width < minSize || rect.height < minSize) {
          const selector = el.id
            ? `#${el.id}`
            : el.className
              ? `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`
              : el.tagName.toLowerCase();
          smallTargets.push({
            selector,
            width: rect.width,
            height: rect.height,
          });
        }
      });

      return { smallTargets };
    }, minTouchSize);

    return result;
  }

  /**
   * 测试安全区域适配（刘海屏）
   */
  async testSafeArea(): Promise<{
    issues: Array<{ selector: string; issue: string }>;
  }> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const result = await this.page.evaluate(() => {
      const issues: Array<{ selector: string; issue: string }> = [];

      // 检查顶部固定元素是否在安全区域内
      document.querySelectorAll('header, nav, [style*="position: fixed"][style*="top"]').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' && parseInt(style.top) < 44) {
          const selector = el.id ? `#${el.id}` : el.tagName.toLowerCase();
          issues.push({
            selector,
            issue: 'Fixed element may be obscured by notch',
          });
        }
      });

      // 检查底部固定元素是否在安全区域内
      document.querySelectorAll('footer, [style*="position: fixed"][style*="bottom"]').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed') {
          const rect = el.getBoundingClientRect();
          if (window.innerHeight - rect.bottom < 34) {
            const selector = el.id ? `#${el.id}` : el.tagName.toLowerCase();
            issues.push({
              selector,
              issue: 'Fixed element may be obscured by home indicator',
            });
          }
        }
      });

      return { issues };
    });

    return result;
  }

  /**
   * 运行移动端特定测试
   */
  async runMobileTests(): Promise<{
    viewportAdaptation: { hasHorizontalScroll: boolean; overflowElements: string[] };
    touchTargets: { smallTargets: Array<{ selector: string; width: number; height: number }> };
    safeArea: { issues: Array<{ selector: string; issue: string }> };
  }> {
    const viewportAdaptation = await this.testViewportAdaptation();
    const touchTargets = await this.testTouchTargets();
    const safeArea = await this.testSafeArea();

    return {
      viewportAdaptation,
      touchTargets,
      safeArea,
    };
  }
}

/**
 * 快捷执行函数
 */
export async function runH5Test(
  testCase: TestCase,
  config?: Partial<H5TesterConfig>,
): Promise<TestCaseResult> {
  const tester = new H5Tester(config);
  try {
    return await tester.runTest(testCase);
  } finally {
    await tester.close();
  }
}
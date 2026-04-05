import { type Browser, type Page } from 'playwright';
import { logger } from '@/core/logger.js';
import type {
  PageSnapshot,
  InteractiveElement,
  FormInfo,
  NetworkRequest,
} from '@/types/crawler.types.js';

/**
 * 页面快照配置
 */
export interface SnapshotConfig {
  fullPageScreenshot: boolean;
  viewportScreenshot: boolean;
  captureDom: boolean;
  captureInteractiveElements: boolean;
  captureForms: boolean;
  captureNetworkRequests: boolean;
  timeout: number;
}

/**
 * 默认快照配置
 */
const DEFAULT_SNAPSHOT_CONFIG: SnapshotConfig = {
  fullPageScreenshot: true,
  viewportScreenshot: true,
  captureDom: true,
  captureInteractiveElements: true,
  captureForms: true,
  captureNetworkRequests: true,
  timeout: 30000,
};

/**
 * 页面快照器类
 */
export class PageSnapshotter {
  private config: SnapshotConfig;
  private networkRequests: NetworkRequest[] = [];

  constructor(config: Partial<SnapshotConfig> = {}) {
    this.config = { ...DEFAULT_SNAPSHOT_CONFIG, ...config };
  }

  /**
   * 生成页面快照
   */
  async takeSnapshot(
    page: Page,
    url: string,
  ): Promise<PageSnapshot> {
    logger.step('📸 开始生成页面快照', { url });
    this.networkRequests = [];

    // 设置网络请求监听
    if (this.config.captureNetworkRequests) {
      await this.setupNetworkListener(page);
    }

    // 等待页面稳定
    await page.waitForLoadState('domcontentloaded');
    await this.waitForStable(page);

    const startTime = Date.now();

    // 获取页面标题
    const title = await page.title();

    // 截图
    const screenshots = await this.captureScreenshots(page);

    // DOM 结构
    const html = this.config.captureDom
      ? await this.getSimplifiedDom(page)
      : '';

    // 可交互元素
    const interactiveElements = this.config.captureInteractiveElements
      ? await this.extractInteractiveElements(page)
      : [];

    // 表单信息
    const forms = this.config.captureForms
      ? await this.extractForms(page)
      : [];

    // 页面元数据
    const metadata = await this.getPageMetadata(page);

    const loadTime = Date.now() - startTime;

    logger.pass('✅ 页面快照生成完成', {
      url,
      title,
      elements: interactiveElements?.length || 0,
      forms: forms?.length || 0,
      requests: this.networkRequests?.length || 0,
    });

    return {
      url,
      title,
      timestamp: new Date().toISOString(),
      screenshot: screenshots,
      html,
      interactiveElements,
      forms,
      networkRequests: this.networkRequests,
      metadata: {
        loadTime,
        domNodes: metadata?.domNodes || 0,
        scripts: metadata?.scripts || 0,
        stylesheets: metadata?.stylesheets || 0,
      },
    };
  }

  /**
   * 设置网络请求监听
   */
  private async setupNetworkListener(page: Page): Promise<void> {
    page.on('request', request => {
      const url = request.url();
      const method = request.method();
      const type = this.getRequestType(request.resourceType());
      const requestHeaders = request.headers();

      // 记录请求开始时间
      const startTime = Date.now();

      // 监听响应
      request.response()?.then(response => {
        if (!response) return;

        const endTime = Date.now();
        const duration = endTime - startTime;

        this.networkRequests.push({
          url,
          method,
          status: response.status(),
          type,
          timing: {
            startTime,
            endTime,
            duration,
          },
          requestHeaders,
          requestBody: request.postData() ?? undefined,
          responseHeaders: response.headers(),
        });
      });
    });
  }

  /**
   * 获取请求类型
   */
  private getRequestType(resourceType: string): NetworkRequest['type'] {
    const typeMap: Record<string, NetworkRequest['type']> = {
      document: 'other',
      stylesheet: 'stylesheet',
      image: 'image',
      media: 'other',
      font: 'font',
      script: 'script',
      xhr: 'api',
      fetch: 'api',
      websocket: 'api',
      other: 'other',
    };
    return typeMap[resourceType] || 'other';
  }

  /**
   * 等待页面稳定（智能等待）
   * 通过轮询检查页面状态，而非硬等待
   */
  private async waitForStable(page: Page): Promise<void> {
    const maxWaitTime = 5000; // 最大等待 5 秒
    const pollInterval = 200; // 每 200ms 检查一次
    const startTime = Date.now();

    // 先等待页面基础加载完成
    try {
      await page.waitForFunction(
        () => {
          // 检查 document.readyState
          if (document.readyState !== 'complete') {
            return false;
          }

          // 检查是否有 loading 状态的元素
          const loadingSelectors = [
            '[data-loading="true"]',
            '.loading',
            '.spinner',
            '.loader',
            '[aria-busy="true"]',
          ];
          for (const selector of loadingSelectors) {
            if (document.querySelector(selector)) {
              return false;
            }
          }

          return true;
        },
        { timeout: Math.min(this.config.timeout, maxWaitTime) },
      );
    } catch {
      // 超时不影响继续执行
      logger.warn('⚠️ 页面稳定检查超时');
    }

    // 额外等待动态内容加载 - 使用智能等待而非固定等待
    let stableCount = 0;
    let lastElementCount = 0;

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // 检查 DOM 元素数量是否稳定
        const currentCount = await page.evaluate(() => {
          return document.querySelectorAll('*').length;
        });

        if (currentCount === lastElementCount) {
          stableCount++;
          // 连续两次检查元素数量不变，认为页面稳定
          if (stableCount >= 2) {
            return;
          }
        } else {
          stableCount = 0;
          lastElementCount = currentCount;
        }

        await page.waitForTimeout(pollInterval);
      } catch {
        // 检查失败，继续等待
        await page.waitForTimeout(pollInterval);
      }
    }

    logger.debug('页面稳定等待完成', { duration: Date.now() - startTime });
  }

  /**
   * 截取页面截图
   */
  private async captureScreenshots(
    page: Page,
  ): Promise<{ fullPage: string; viewport: string }> {
    const result: { fullPage: string; viewport: string } = {
      fullPage: '',
      viewport: '',
    };

    try {
      if (this.config.fullPageScreenshot) {
        result.fullPage = await page.screenshot({
          fullPage: true,
          type: 'jpeg',
          quality: 80,
        }).then(buffer => buffer.toString('base64'));
      }

      if (this.config.viewportScreenshot) {
        result.viewport = await page.screenshot({
          type: 'jpeg',
          quality: 80,
        }).then(buffer => buffer.toString('base64'));
      }
    } catch (error) {
      logger.fail('❌ 截图失败', { error: String(error) });
    }

    return result;
  }

  /**
   * 获取精简的 DOM 结构
   */
  private async getSimplifiedDom(page: Page): Promise<string> {
    try {
      const html = await page.evaluate(function() {
        if (!document.body) return '';

        const clone = document.body.cloneNode(true) as HTMLElement;

        const removeSelectors = [
          'script', 'style', 'noscript', 'iframe', 'svg',
          'link[rel="stylesheet"]', '[data-testid]', '[hidden]',
          '.hidden', '[aria-hidden="true"]'
        ];

        removeSelectors.forEach(function(selector) {
          clone.querySelectorAll(selector).forEach(function(el) { el.remove(); });
        });

        clone.querySelectorAll('*').forEach(function(el) {
          el.removeAttribute('style');
          el.removeAttribute('class');
          el.removeAttribute('onclick');
          el.removeAttribute('onload');
          el.removeAttribute('onerror');
          el.removeAttribute('data-reactid');
          el.removeAttribute('data-react-checksum');
        });

        const maxDepth = 5;
        const maxTextLength = 100;

        function simplifyNode(node: Element, depth: number): string {
          if (depth > maxDepth) return '';
          if (!node.tagName) return '';

          let result = '<' + node.tagName.toLowerCase();

          const keepAttrs = ['id', 'name', 'type', 'href', 'src', 'alt', 'placeholder', 'role', 'tabindex', 'data-testid', 'data-cy', 'aria-label', 'aria-labelledby', 'aria-describedby'];
          keepAttrs.forEach(function(attr) {
            const value = node.getAttribute(attr);
            if (value) result += ' ' + attr + '="' + String(value).slice(0, 50) + '"';
          });

          result += '>';

          const text = (node.textContent || '').trim().slice(0, maxTextLength);
          if (text && node.children.length === 0) result += text;

          Array.from(node.children).slice(0, 20).forEach(function(child) {
            result += simplifyNode(child, depth + 1);
          });

          result += '</' + node.tagName.toLowerCase() + '>';
          return result;
        }

        return simplifyNode(clone, 0);
      });

      return typeof html === 'string' ? html : '';
    } catch (error) {
      logger.warn('⚠️ DOM 简化失败', { error: String(error) });
      return '';
    }
  }

  /**
   * 提取可交互元素
   */
  private async extractInteractiveElements(
    page: Page,
  ): Promise<InteractiveElement[]> {
    try {
      const result = await page.evaluate(function() {
        const elements: Array<{
          tag: string;
          text?: string;
          selector: string;
          alternativeSelectors: string[];
          position: { x: number; y: number; width: number; height: number };
          visible: boolean;
          clickable: boolean;
          disabled: boolean;
          attributes: Record<string, string>;
          type?: string;
          value?: string;
        }> = [];

        const interactiveSelectors = [
          'a[href]', 'button', 'input', 'select', 'textarea',
          '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
          '[role="tab"]', '[role="menuitem"]', '[role="option"]', '[role="slider"]',
          '[role="spinbutton"]', '[role="textbox"]', '[role="searchbox"]', '[role="combobox"]',
          '[role="listbox"]', '[role="switch"]',
          '[tabindex]:not([tabindex="-1"])', '[onclick]', '[data-clickable]',
          '[data-action]', 'label', 'optgroup', 'option', '[draggable="true"]',
          'summary', '[aria-haspopup]'
        ];

        interactiveSelectors.forEach(function(selector) {
          try {
            document.querySelectorAll(selector).forEach(function(el) {
              const rect = el.getBoundingClientRect();
              const computedStyle = window.getComputedStyle(el);
              const visible = rect.width > 0 && rect.height > 0 &&
                computedStyle.visibility !== 'hidden' &&
                computedStyle.display !== 'none';

              const selectors: string[] = [];

              if (el.id) selectors.push('#' + el.id);
              const testid = el.getAttribute('data-testid');
              if (testid) selectors.push('[data-testid="' + testid + '"]');
              const datacy = el.getAttribute('data-cy');
              if (datacy) selectors.push('[data-cy="' + datacy + '"]');
              const ariaLabel = el.getAttribute('aria-label');
              if (ariaLabel) selectors.push('[aria-label="' + ariaLabel + '"]');
              const nameAttr = el.getAttribute('name');
              if (nameAttr) selectors.push('[name="' + nameAttr + '"]');
              const roleAttr = el.getAttribute('role');
              if (roleAttr) selectors.push('[role="' + roleAttr + '"]');

              const text = (el.textContent || '').trim();
              if (text && text.length < 50 && (el.tagName === 'BUTTON' || el.tagName === 'A')) {
                selectors.push(el.tagName.toLowerCase() + ':has-text("' + text.slice(0, 30) + '")');
              }

              if (el.className && typeof el.className === 'string') {
                const classes = el.className.split(' ').filter(function(c) { return c && !c.includes(':'); });
                if (classes.length > 0) selectors.push('.' + classes.slice(0, 2).join('.'));
              }

              selectors.push(el.tagName.toLowerCase());

              const attributes: Record<string, string> = {};
              try {
                Array.from(el.attributes).forEach(function(attr) {
                  attributes[attr.name] = attr.value;
                });
              } catch (e) { /* ignore */ }

              const clickable = !el.hasAttribute('disabled') &&
                el.getAttribute('aria-disabled') !== 'true';

              const elValue = (el as HTMLInputElement).value;
              const elType = el.getAttribute('type') || el.tagName.toLowerCase();

              elements.push({
                tag: el.tagName.toLowerCase(),
                text: (el.textContent || '').trim().slice(0, 100) || undefined,
                selector: selectors[0] || el.tagName.toLowerCase(),
                alternativeSelectors: selectors.slice(1),
                position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                visible,
                clickable,
                disabled: el.hasAttribute('disabled'),
                attributes,
                type: elType,
                value: elValue || undefined
              });
            });
          } catch (selectorError) {
            // Skip problematic selectors
          }
        });

        return elements;
      });
      return Array.isArray(result) ? result : [];
    } catch (error) {
      logger.warn('⚠️ 提取交互元素失败', { error: String(error) });
      return [];
    }
  }

  /**
   * 提取表单信息
   */
  private async extractForms(page: Page): Promise<FormInfo[]> {
    try {
      const result = await page.evaluate(function() {
        const forms: Array<{
          selector: string;
          action: string;
          method: string;
          fields: Array<{
            selector: string;
            type: string;
            name: string;
            label: string;
            required: boolean;
            placeholder?: string;
            validation?: Record<string, unknown>;
          }>;
        }> = [];

        document.querySelectorAll('form').forEach(function(form) {
          const formInfo = {
            selector: form.id ? '#' + form.id : 'form',
            action: form.action,
            method: form.method,
            fields: [] as Array<{
              selector: string;
              type: string;
              name: string;
              label: string;
              required: boolean;
              placeholder?: string;
              validation?: Record<string, unknown>;
            }>
          };

          form.querySelectorAll('input, select, textarea').forEach(function(field) {
            let label = '';
            const fieldEl = field as HTMLInputElement;
            if (fieldEl.id) {
              const labelEl = document.querySelector('label[for="' + fieldEl.id + '"]');
              if (labelEl) label = (labelEl.textContent || '').trim();
            }
            if (!label && fieldEl.closest('label')) {
              label = (fieldEl.closest('label')?.textContent || '').trim();
            }
            if (!label && fieldEl.getAttribute('aria-label')) {
              label = fieldEl.getAttribute('aria-label') || '';
            }
            if (!label && fieldEl.getAttribute('aria-labelledby')) {
              const labelledBy = document.getElementById(fieldEl.getAttribute('aria-labelledby') || '');
              if (labelledBy) label = (labelledBy.textContent || '').trim();
            }

            const selectors: string[] = [];
            if (fieldEl.id) selectors.push('#' + fieldEl.id);
            if (fieldEl.name) selectors.push('[name="' + fieldEl.name + '"]');
            const testid = fieldEl.getAttribute('data-testid');
            if (testid) selectors.push('[data-testid="' + testid + '"]');

            const validation: Record<string, unknown> = {};
            if (fieldEl.pattern) validation.pattern = fieldEl.pattern;
            if (fieldEl.minLength !== undefined && fieldEl.minLength !== -1) validation.minLength = fieldEl.minLength;
            if (fieldEl.maxLength !== undefined && fieldEl.maxLength !== -1) validation.maxLength = fieldEl.maxLength;
            if (fieldEl.min) validation.min = parseFloat(fieldEl.min);
            if (fieldEl.max) validation.max = parseFloat(fieldEl.max);

            formInfo.fields.push({
              selector: selectors[0] || fieldEl.tagName.toLowerCase(),
              type: fieldEl.type || fieldEl.tagName.toLowerCase(),
              name: fieldEl.name,
              label,
              required: fieldEl.required || fieldEl.getAttribute('aria-required') === 'true',
              placeholder: fieldEl.placeholder,
              validation: Object.keys(validation).length > 0 ? validation : undefined
            });
          });

          forms.push(formInfo);
        });

        return forms;
      });
      return Array.isArray(result) ? result : [];
    } catch {
      return [];
    }
  }

  /**
   * 获取页面元数据
   */
  private async getPageMetadata(
    page: Page,
  ): Promise<{ domNodes: number; scripts: number; stylesheets: number }> {
    try {
      const result = await page.evaluate(function() {
        return {
          domNodes: document.querySelectorAll('*').length,
          scripts: document.querySelectorAll('script').length,
          stylesheets: document.querySelectorAll('link[rel="stylesheet"], style').length
        };
      });
      return result as { domNodes: number; scripts: number; stylesheets: number };
    } catch {
      return { domNodes: 0, scripts: 0, stylesheets: 0 };
    }
  }
}

/**
 * 快捷快照函数
 * 支持两种调用方式：
 * 1. takePageSnapshot(page, url, options)
 * 2. takePageSnapshot(page, options) - 自动从 page.url() 获取 URL
 */
export async function takePageSnapshot(
  page: Page,
  urlOrOptions?: string | Partial<SnapshotConfig>,
  options?: Partial<SnapshotConfig>,
): Promise<PageSnapshot> {
  let url: string;
  let actualOptions: Partial<SnapshotConfig> | undefined;

  if (typeof urlOrOptions === 'string') {
    url = urlOrOptions;
    actualOptions = options;
  } else {
    // 从 page 获取 URL
    url = page.url();
    actualOptions = urlOrOptions;
  }

  const snapshotter = new PageSnapshotter(actualOptions);
  return snapshotter.takeSnapshot(page, url);
}

/**
 * 使用浏览器生成快照的便捷函数
 */
export async function snapshotUrl(
  url: string,
  browser: Browser,
  options?: Partial<SnapshotConfig>,
): Promise<PageSnapshot> {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    const snapshotter = new PageSnapshotter(options);
    return snapshotter.takeSnapshot(page, url);
  } finally {
    await context.close();
  }
}
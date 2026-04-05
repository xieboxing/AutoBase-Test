import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { SecurityIssue } from '@/types/test-result.types.js';

/**
 * XSS 测试向量
 */
export const XSS_PAYLOADS = [
  // 基础脚本注入
  '<script>alert(1)</script>',
  '<script>alert(document.domain)</script>',
  '<script>alert(XSS)</script>',

  // 事件处理器注入
  '<img src=x onerror=alert(1)>',
  '<img src="javascript:alert(1)">',
  '<svg onload=alert(1)>',
  '<svg/onload=alert(1)>',
  '<body onload=alert(1)>',
  '<input onfocus=alert(1) autofocus>',
  '<select onfocus=alert(1) autofocus>',
  '<textarea onfocus=alert(1) autofocus>',
  '<keygen onfocus=alert(1) autofocus>',
  '<video><source onerror=alert(1)>',
  '<audio src=x onerror=alert(1)>',
  '<details open ontoggle=alert(1)>',

  // JavaScript URI
  'javascript:alert(1)',
  'javascript:alert(document.cookie)',
  'JaVaScRiPt:alert(1)',
  'javascript:alert(1)//',

  // HTML 实体编码
  '<script>&#97;&#108;&#101;&#114;&#116;(1)</script>',
  '<script>alert&#40;1&#41;</script>',

  // 大小写混合
  '<ScRiPt>alert(1)</ScRiPt>',
  '<SCRIPT>alert(1)</SCRIPT>',

  // 闭合标签
  '"></script><script>alert(1)</script>',
  "'></script><script>alert(1)</script>",
  '"><script>alert(1)</script>',
  "'><script>alert(1)</script>",

  // 属性注入
  '" onmouseover="alert(1)',
  "' onmouseover='alert(1)",
  '" onclick="alert(1)',
  "' onclick='alert(1)",

  // SVG/MathML 注入
  '<math><mtext><script>alert(1)</script></mtext></math>',
  '<svg><script>alert(1)</script></svg>',

  // Data URI
  'data:text/html,<script>alert(1)</script>',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',

  // 表单注入
  '<form action="javascript:alert(1)"><input type=submit>',
  '<isindex action="javascript:alert(1)">',

  // Object/Embed 注入
  '<object data="javascript:alert(1)">',
  '<embed src="javascript:alert(1)">',

  // Style 注入 (IE specific)
  '<style>@import "javascript:alert(1)"</style>',
  '<div style="background-image:url(javascript:alert(1))">',

  // Meta 标签注入
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',

  // 突破过滤器
  '<<script>alert(1)//<</script>',
  '<scr<script>ipt>alert(1)</scr</script>ipt>',
  '"><script>alert(1)</script>',
  "\"'><script>alert(1)</script>",

  // 空字节注入
  '<scr\x00ipt>alert(1)</script>',

  // Unicode 编码
  '\u003cscript\u003ealert(1)\u003c/script\u003e',
];

/**
 * XSS 检测结果
 */
export interface XssDetectionResult {
  url: string;
  passed: boolean;
  vulnerableFields: XssVulnerability[];
  testedFields: number;
  totalPayloads: number;
  executionTime: number;
}

/**
 * XSS 漏洞信息
 */
export interface XssVulnerability extends SecurityIssue {
  fieldSelector: string;
  fieldType: string;
  payload: string;
  executionMethod: 'alert' | 'dom_render' | 'event_handler' | 'url_redirect' | 'unknown';
  proofOfConcept?: string;
  screenshot?: string;
}

/**
 * 可输入字段信息
 */
export interface InputField {
  selector: string;
  type: string;
  name?: string;
  id?: string;
  placeholder?: string;
  acceptsText: boolean;
}

/**
 * XSS 测试器配置
 */
export interface XssTesterConfig {
  headless: boolean;
  timeout: number;
  viewport: { width: number; height: number };
  payloads: string[];
  maxPayloadsPerField: number;
  checkDomRendering: boolean;
  checkEventHandlers: boolean;
  checkUrlInjection: boolean;
  artifactsDir: string;
  stopOnFirstVulnerability: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_XSS_TESTER_CONFIG: XssTesterConfig = {
  headless: true,
  timeout: 30000,
  viewport: { width: 1920, height: 1080 },
  payloads: XSS_PAYLOADS,
  maxPayloadsPerField: 20, // 限制每个字段测试的 payload 数量
  checkDomRendering: true,
  checkEventHandlers: true,
  checkUrlInjection: true,
  artifactsDir: './data/screenshots/security',
  stopOnFirstVulnerability: false,
};

/**
 * XSS 安全测试器
 * 自动检测页面中的 XSS 漏洞
 */
export class XssTester {
  private config: XssTesterConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private vulnerabilities: XssVulnerability[] = [];
  private alertTriggered: boolean = false;
  private testId: string;

  constructor(config: Partial<XssTesterConfig> = {}) {
    this.config = { ...DEFAULT_XSS_TESTER_CONFIG, ...config };
    this.testId = nanoid(8);
  }

  /**
   * 初始化浏览器
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.config.artifactsDir, { recursive: true });

    this.browser = await chromium.launch({
      headless: this.config.headless,
    });

    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
      // 禁用某些安全特性以便检测 XSS
      javaScriptEnabled: true,
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeout);

    // 监听 dialog 事件（alert/confirm/prompt）
    this.page.on('dialog', async dialog => {
      this.alertTriggered = true;
      logger.warn(`    ⚠️ 检测到 alert 弹窗: "${dialog.message()}"`);
      await dialog.dismiss();
    });

    // 监听页面错误
    this.page.on('pageerror', error => {
      logger.warn(`    ⚠️ 页面 JS 错误: ${error.message}`);
    });

    logger.pass('✅ XSS 测试器初始化完成');
  }

  /**
   * 测试页面 XSS 漏洞
   */
  async testXss(url: string): Promise<XssDetectionResult> {
    if (!this.page) {
      await this.initialize();
    }

    const startTime = Date.now();
    this.vulnerabilities = [];

    logger.step(`🔒 开始 XSS 安全测试: ${url}`);

    try {
      await this.page!.goto(url, { waitUntil: 'domcontentloaded' });
      await this.page!.waitForLoadState('networkidle').catch(() => {});
    } catch (error) {
      logger.fail(`  ❌ 无法访问页面: ${error}`);
      return {
        url,
        passed: false,
        vulnerableFields: [],
        testedFields: 0,
        totalPayloads: 0,
        executionTime: Date.now() - startTime,
      };
    }

    // 发现所有可输入字段
    const inputFields = await this.discoverInputFields();
    logger.step(`  📊 发现 ${inputFields.length} 个可输入字段`);

    // 测试 URL 参数注入
    if (this.config.checkUrlInjection) {
      await this.testUrlInjection(url);
    }

    // 测试每个输入字段
    const payloadsToTest = this.config.payloads.slice(0, this.config.maxPayloadsPerField);

    for (const field of inputFields) {
      if (this.config.stopOnFirstVulnerability && this.vulnerabilities.length > 0) {
        break;
      }

      await this.testFieldXss(field, payloadsToTest);

      // 每次测试后刷新页面
      await this.page!.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      this.alertTriggered = false;
    }

    const executionTime = Date.now() - startTime;
    const passed = this.vulnerabilities.length === 0;

    if (passed) {
      logger.pass(`  ✅ XSS 测试通过: 未发现漏洞`);
    } else {
      logger.fail(`  ❌ 发现 ${this.vulnerabilities.length} 个 XSS 漏洞`);
    }

    return {
      url,
      passed,
      vulnerableFields: this.vulnerabilities,
      testedFields: inputFields.length,
      totalPayloads: payloadsToTest.length * inputFields.length,
      executionTime,
    };
  }

  /**
   * 发现页面上所有可输入字段
   */
  private async discoverInputFields(): Promise<InputField[]> {
    if (!this.page) return [];

    return await this.page.evaluate(() => {
      const fields: InputField[] = [];

      // 查找所有 input 元素
      document.querySelectorAll('input, textarea, select').forEach(el => {
        const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

        // 排除隐藏字段、提交按钮等
        const type = input.type || input.tagName.toLowerCase();
        if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset' || type === 'image') {
          return;
        }

        // 构建选择器
        let selector = '';
        if (input.id) {
          selector = `#${input.id}`;
        } else if (input.name) {
          selector = `[name="${input.name}"]`;
        } else {
          selector = input.tagName.toLowerCase();
          if (input.className) {
            selector += `.${input.className.split(' ')[0]}`;
          }
        }

        const isInputOrTextarea = input.tagName === 'INPUT' || input.tagName === 'TEXTAREA';
        fields.push({
          selector,
          type,
          name: input.name || undefined,
          id: input.id || undefined,
          placeholder: isInputOrTextarea ? (input as HTMLInputElement | HTMLTextAreaElement).placeholder || undefined : undefined,
          acceptsText: type !== 'checkbox' && type !== 'radio' && type !== 'file' && type !== 'range',
        });
      });

      // 查找可编辑的元素 (contenteditable)
      document.querySelectorAll('[contenteditable="true"]').forEach(el => {
        fields.push({
          selector: `#${el.id}` || `[contenteditable="true"]`,
          type: 'contenteditable',
          acceptsText: true,
        });
      });

      return fields;
    });
  }

  /**
   * 测试 URL 参数注入
   */
  private async testUrlInjection(baseUrl: string): Promise<void> {
    if (!this.page) return;

    logger.step('  🔍 测试 URL 参数注入');

    // 获取当前 URL 的查询参数
    const urlObj = new URL(baseUrl);
    const params = Array.from(urlObj.searchParams.keys());

    if (params.length === 0) {
      // 尝试常见的参数名
      const commonParams = ['q', 'query', 'search', 'id', 'page', 'url', 'redirect', 'callback', 'jsonp'];

      for (const param of commonParams.slice(0, 5)) {
        for (const payload of this.config.payloads.slice(0, 5)) {
          const testUrl = `${baseUrl}?${param}=${encodeURIComponent(payload)}`;

          try {
            this.alertTriggered = false;
            await this.page!.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 5000 });

            if (this.alertTriggered) {
              this.vulnerabilities.push({
                type: 'xss',
                severity: 'high',
                description: `URL 参数 "${param}" 存在 XSS 漏洞`,
                fieldSelector: `URL参数: ${param}`,
                fieldType: 'url_param',
                payload,
                executionMethod: 'alert',
                location: testUrl,
                recommendation: '对 URL 参数进行严格的输入验证和输出编码',
              });

              if (this.config.stopOnFirstVulnerability) return;
            }
          } catch {
            // 忽略导航错误
          }
        }
      }
    } else {
      // 测试现有参数
      for (const param of params) {
        for (const payload of this.config.payloads.slice(0, 5)) {
          const testUrl = new URL(baseUrl);
          testUrl.searchParams.set(param, payload);

          try {
            this.alertTriggered = false;
            await this.page!.goto(testUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 5000 });

            if (this.alertTriggered) {
              this.vulnerabilities.push({
                type: 'xss',
                severity: 'high',
                description: `URL 参数 "${param}" 存在 XSS 漏洞`,
                fieldSelector: `URL参数: ${param}`,
                fieldType: 'url_param',
                payload,
                executionMethod: 'alert',
                location: testUrl.toString(),
                recommendation: '对 URL 参数进行严格的输入验证和输出编码',
              });

              if (this.config.stopOnFirstVulnerability) return;
            }
          } catch {
            // 忽略导航错误
          }
        }
      }
    }
  }

  /**
   * 测试单个字段的 XSS 漏洞
   */
  private async testFieldXss(field: InputField, payloads: string[]): Promise<void> {
    if (!this.page || !field.acceptsText) return;

    logger.step(`  🔍 测试字段: ${field.selector} (${field.type})`);

    for (const payload of payloads) {
      if (this.config.stopOnFirstVulnerability && this.vulnerabilities.length > 0) {
        break;
      }

      this.alertTriggered = false;

      try {
        // 尝试输入 payload
        const locator = this.page.locator(field.selector);

        // 检查元素是否存在且可见
        const isVisible = await locator.isVisible().catch(() => false);
        if (!isVisible) continue;

        // 清空字段并输入 payload
        await locator.clear();
        await locator.fill(payload);

        // 触发 change 和 blur 事件
        await locator.blur();
        // 智能等待：等待 DOM 更新和可能的脚本执行（而非固定等待）
        await this.waitForXssExecution(100);

        // 检查是否触发 alert
        if (this.alertTriggered) {
          const screenshot = await this.takeScreenshot('xss-alert', field.selector);

          this.vulnerabilities.push({
            type: 'xss',
            severity: 'high',
            description: `字段 "${field.selector}" 存在 XSS 漏洞，可通过 alert 执行脚本`,
            fieldSelector: field.selector,
            fieldType: field.type,
            payload,
            executionMethod: 'alert',
            proofOfConcept: `输入: ${payload}`,
            screenshot,
            recommendation: '对所有用户输入进行 HTML 编码，使用 Content-Security-Policy 禁止内联脚本',
          });

          continue;
        }

        // 检查 DOM 中是否原样渲染了脚本
        if (this.config.checkDomRendering) {
          const domVulnerability = await this.checkDomRendering(field, payload);
          if (domVulnerability) {
            this.vulnerabilities.push(domVulnerability);
            continue;
          }
        }

        // 尝试提交表单（如果存在）
        const formSubmitResult = await this.trySubmitForm(field, payload);
        if (formSubmitResult) {
          this.vulnerabilities.push(formSubmitResult);
        }

      } catch (error) {
        // 忽略无法操作的元素
        logger.warn(`    ⚠️ 无法测试 payload "${payload.substring(0, 30)}...": ${error}`);
      }
    }
  }

  /**
   * 检查 DOM 渲染
   */
  private async checkDomRendering(field: InputField, payload: string): Promise<XssVulnerability | null> {
    if (!this.page) return null;

    // 检查 payload 是否被原样渲染到 DOM 中
    const hasUnescapedScript = await this.page.evaluate((payload: string) => {
      // 检查是否有未转义的 script 标签
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const script of scripts) {
        if (script.textContent?.includes('alert') || script.innerHTML.includes('alert')) {
          // 检查是否是用户输入导致的
          if (document.body.innerHTML.includes(payload)) {
            return true;
          }
        }
      }

      // 检查是否有注入的事件处理器
      const allElements = Array.from(document.querySelectorAll('*'));
      for (const el of allElements) {
        const attrs = Array.from(el.attributes);
        for (const attr of attrs) {
          if (attr.name.startsWith('on') && (attr.value as string).includes('alert')) {
            return true;
          }
        }
      }

      return false;
    }, payload);

    if (hasUnescapedScript) {
      const screenshot = await this.takeScreenshot('xss-dom', field.selector);

      return {
        type: 'xss',
        severity: 'high',
        description: `字段 "${field.selector}" 存在 XSS 漏洞，脚本被原样渲染到 DOM`,
        fieldSelector: field.selector,
        fieldType: field.type,
        payload,
        executionMethod: 'dom_render',
        proofOfConcept: `输入后检查 DOM 发现未转义脚本`,
        screenshot,
        recommendation: '使用 textContent 而非 innerHTML 设置文本，对所有输出进行 HTML 编码',
      };
    }

    return null;
  }

  /**
   * 尝试提交表单
   */
  private async trySubmitForm(field: InputField, payload: string): Promise<XssVulnerability | null> {
    if (!this.page) return null;

    try {
      // 查找包含该字段的表单
      const form = await this.page.locator(`${field.selector}`).evaluateHandle((el) => {
        return el.closest('form');
      });

      const formElement = form.asElement();
      if (!formElement) return null;

      // 查找提交按钮 - 使用 page.locator 查找表单内的提交按钮
      const submitBtn = this.page.locator(`${field.selector}`).locator('xpath=ancestor::form//button[type="submit"] | xpath=ancestor::form//input[type="submit"]');
      const hasSubmitBtn = await submitBtn.count() > 0;

      if (hasSubmitBtn) {
        // 点击提交
        await submitBtn.first().click();
        // 智能等待：等待表单提交完成和可能的 XSS 执行（而非固定等待）
        await this.waitForXssExecution(500);

        // 检查是否触发 alert
        if (this.alertTriggered) {
          const screenshot = await this.takeScreenshot('xss-submit', field.selector);

          return {
            type: 'xss',
            severity: 'critical',
            description: `字段 "${field.selector}" 存在 XSS 漏洞，提交后触发脚本执行`,
            fieldSelector: field.selector,
            fieldType: field.type,
            payload,
            executionMethod: 'alert',
            proofOfConcept: `输入并提交后触发 alert`,
            screenshot,
            recommendation: '服务端必须对所有输入进行严格验证和输出编码',
          };
        }
      }
    } catch {
      // 忽略表单提交错误
    }

    return null;
  }

  /**
   * 截图
   */
  private async takeScreenshot(type: string, fieldSelector: string): Promise<string> {
    if (!this.page) return '';

    const filename = `xss-${this.testId}-${type}-${fieldSelector.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    const filepath = path.join(this.config.artifactsDir, filename);

    try {
      await this.page.screenshot({ path: filepath, fullPage: true });
      return filepath;
    } catch {
      return '';
    }
  }

  /**
   * 获取测试摘要
   */
  getSummary(): SecurityIssue[] {
    return this.vulnerabilities.map(v => ({
      type: v.type,
      severity: v.severity,
      description: v.description,
      location: v.location || v.fieldSelector,
      recommendation: v.recommendation,
    }));
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    logger.info('🔚 XSS 测试器已关闭');
  }

  /**
   * 智能等待 XSS 执行检测
   * 通过轮询检查是否有脚本执行迹象，而非固定等待
   */
  private async waitForXssExecution(maxWaitMs: number): Promise<void> {
    const pollInterval = Math.min(20, maxWaitMs / 10);
    const startTime = Date.now();
    let lastCheckTime = 0;

    while (Date.now() - startTime < maxWaitMs) {
      // 如果已经检测到 alert，立即返回
      if (this.alertTriggered) {
        return;
      }

      // 每 50ms 检查一次 DOM 变化
      if (Date.now() - lastCheckTime > 50) {
        try {
          const hasScriptExecution = await this.page!.evaluate(() => {
            // 检查是否有新创建的 script 标签
            const scripts = document.querySelectorAll('script');
            // 检查是否有注入的事件处理器
            const allElements = document.querySelectorAll('*');
            for (const el of Array.from(allElements)) {
              const attrs = Array.from(el.attributes);
              for (const attr of attrs) {
                if (attr.name.startsWith('on') && (attr.value as string).includes('alert')) {
                  return true;
                }
              }
            }
            return false;
          });

          if (hasScriptExecution) {
            return;
          }
          lastCheckTime = Date.now();
        } catch {
          // 忽略评估错误
        }
      }

      await this.page!.waitForTimeout(pollInterval);
    }
  }
}

/**
 * 快捷测试函数
 */
export async function testXss(
  url: string,
  config?: Partial<XssTesterConfig>,
): Promise<XssDetectionResult> {
  const tester = new XssTester(config);
  try {
    return await tester.testXss(url);
  } finally {
    await tester.close();
  }
}

/**
 * 批量测试多个 URL
 */
export async function testXssBatch(
  urls: string[],
  config?: Partial<XssTesterConfig>,
): Promise<XssDetectionResult[]> {
  const tester = new XssTester(config);
  const results: XssDetectionResult[] = [];

  try {
    for (const url of urls) {
      const result = await tester.testXss(url);
      results.push(result);

      // 重置状态
      tester['vulnerabilities'] = [];
      tester['alertTriggered'] = false;
    }
  } finally {
    await tester.close();
  }

  return results;
}
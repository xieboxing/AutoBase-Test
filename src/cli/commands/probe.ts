/**
 * 页面探测命令
 * 用于分析 APP 页面结构、提取元素信息、生成定位器建议
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { logger } from '@/core/logger.js';
import { deviceManager } from '@/utils/device.js';
import { remote, type Browser } from 'webdriverio';
import type {
  ProbeResult,
  ProbePageResult,
  ProbeElement,
  SuggestedLocator,
  ElementLocator,
} from '@/types/financial.types.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { basename } from 'node:path';

/**
 * 探测命令选项
 */
export interface ProbeCommandOptions {
  /** 包名 */
  package?: string;
  /** APK 路径 */
  apk?: string;
  /** 设备 ID */
  device?: string;
  /** 是否启用 OCR */
  ocr?: boolean;
  /** 是否启用 AI */
  ai?: boolean;
  /** 输出目录 */
  output?: string;
  /** 探测页面数量限制 */
  pages?: number;
  /** 快速模式 */
  quick?: boolean;
}

/**
 * 创建探测命令
 */
export function createProbeCommand(): Command {
  const command = new Command('probe');

  command
    .description('探测 APP 页面结构，提取元素信息，生成定位器建议')
    .argument('[package-or-apk]', '包名或 APK 路径')
    .option('--package <name>', '已安装应用的包名')
    .option('--apk <path>', 'APK 文件路径')
    .option('--device <id>', '指定设备 ID')
    .option('--ocr', '启用 OCR 文本识别')
    .option('--ai', '启用 AI 辅助分析')
    .option('--output <dir>', '输出目录', './data/probe')
    .option('--pages <count>', '探测页面数量限制', '10')
    .option('--quick', '快速模式（只探测当前页面）')
    .action(async (input: string | undefined, options: ProbeCommandOptions) => {
      await executeProbe(input, options);
    });

  return command;
}

/**
 * 执行探测
 */
async function executeProbe(input: string | undefined, options: ProbeCommandOptions): Promise<void> {
  console.log(chalk.blue.bold('🔍 APP 页面探测'));
  console.log(chalk.gray('─'.repeat(50)));

  // 检查环境
  console.log(chalk.blue('🏥 检查环境...'));

  const adbCheck = await deviceManager.checkAdb();
  if (!adbCheck.available) {
    console.log(chalk.red('  ✗ ADB 不可用'));
    process.exit(1);
  }
  console.log(chalk.green(`  ✓ ADB 可用 (v${adbCheck.version})`));

  const devices = await deviceManager.getConnectedDevices();
  if (devices.length === 0) {
    console.log(chalk.red('  ✗ 没有连接的设备'));
    process.exit(1);
  }
  console.log(chalk.green(`  ✓ 已连接 ${devices.length} 个设备`));

  // 检查 Appium
  const appiumUrl = process.env.APPIUM_HOST || 'http://127.0.0.1:4723';
  try {
    const response = await fetch(`${appiumUrl}/status`);
    if (response.ok) {
      console.log(chalk.green('  ✓ Appium 已连接'));
    }
  } catch {
    console.log(chalk.yellow('  ⚠ Appium 未运行'));
  }

  // 确定包名和 APK
  let packageName = options.package || input;
  let apkPath = options.apk;

  if (input && input.endsWith('.apk')) {
    apkPath = input;
  } else if (input && input.includes('.')) {
    packageName = input;
  }

  if (!packageName && !apkPath) {
    // 交互式输入
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'inputType',
        message: '选择探测方式:',
        choices: [
          { name: '探测已安装应用（提供包名）', value: 'package' },
          { name: '安装并探测 APK', value: 'apk' },
          { name: '探测当前前台应用', value: 'current' },
        ],
      },
      {
        type: 'input',
        name: 'packageName',
        message: '请输入应用包名（如 com.example.app）:',
        when: (ans: Record<string, unknown>) => ans.inputType === 'package',
        validate: (input: string) => input ? true : '请输入包名',
      },
      {
        type: 'input',
        name: 'apkPath',
        message: '请输入 APK 文件路径:',
        when: (ans: Record<string, unknown>) => ans.inputType === 'apk',
        validate: (input: string) => input ? true : '请输入 APK 路径',
      },
    ]);

    if (answers.inputType === 'package') {
      packageName = answers.packageName as string;
    } else if (answers.inputType === 'apk') {
      apkPath = answers.apkPath as string;
    } else if (answers.inputType === 'current') {
      // 获取当前前台应用
      const deviceId = options.device || devices[0]?.id;
      if (deviceId) {
        try {
          // 使用 adb shell dumpsys 获取当前前台应用
          const output = await deviceManager.shell(deviceId, 'dumpsys window windows | grep -E "mCurrentFocus|mFocusedApp"');
          const match = output.match(/(\w+\.[\w.]+)\/([\w.]+)/);
          if (match && match[1]) {
            packageName = match[1];
            console.log(chalk.cyan(`  当前前台应用: ${packageName}`));
          }
        } catch {
          console.log(chalk.yellow('  无法获取当前前台应用'));
        }
      }
    }
  }

  const deviceId = options.device || devices[0]?.id;
  if (!deviceId) {
    console.log(chalk.red('错误：无法获取设备 ID'));
    process.exit(1);
  }

  console.log(chalk.cyan(`📱 使用设备: ${deviceId}`));

  // 如果有 APK，先安装
  if (apkPath) {
    console.log(chalk.blue('\n📦 安装 APK...'));
    const installResult = await deviceManager.installApk(deviceId, apkPath);
    if (!installResult.success) {
      console.log(chalk.red(`  ✗ 安装失败: ${installResult.message}`));
      process.exit(1);
    }
    console.log(chalk.green('  ✓ APK 安装成功'));

    // 获取包名
    const apkInfo = await deviceManager.getApkInfo(apkPath);
    packageName = apkInfo.packageName || packageName;
    console.log(chalk.green(`  ✓ 包名: ${packageName}`));
  }

  if (!packageName) {
    console.log(chalk.red('错误：需要提供包名或 APK 路径'));
    process.exit(1);
  }

  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.white(`目标应用: ${packageName}`));
  console.log(chalk.white(`启用 OCR: ${options.ocr ? '是' : '否'}`));
  console.log(chalk.white(`启用 AI: ${options.ai ? '是' : '否'}`));
  console.log(chalk.gray('─'.repeat(50)));

  // 创建输出目录
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = join(options.output || './data/probe', `${packageName}_${timestamp}`);
  await mkdir(outputDir, { recursive: true });
  await mkdir(join(outputDir, 'screenshots'), { recursive: true });
  await mkdir(join(outputDir, 'page-sources'), { recursive: true });
  await mkdir(join(outputDir, 'reports'), { recursive: true });

  console.log(chalk.cyan(`📁 输出目录: ${outputDir}`));

  // 开始探测
  let driver: Browser | null = null;

  try {
    console.log(chalk.blue.bold('\n🔍 开始页面探测...'));

    // 连接 Appium
    driver = await remote({
      hostname: process.env.APPIUM_HOST || '127.0.0.1',
      port: parseInt(process.env.APPIUM_PORT || '4723', 10),
      path: '/wd/hub',
      capabilities: {
        platformName: 'Android',
        'appium:deviceName': deviceId,
        'appium:appPackage': packageName,
        'appium:automationName': 'UiAutomator2',
        'appium:noReset': true,
        'appium:newCommandTimeout': 600,
      } as any,
    });

    await driver.connect();
    console.log(chalk.green('  ✓ Appium 连接成功'));

    // 获取当前页面
    const currentPage = await driver.getCurrentActivity();
    console.log(chalk.cyan(`  当前页面: ${currentPage}`));

    // 探测页面
    const pageResults: ProbePageResult[] = [];
    const visitedPages = new Set<string>();

    // 探测当前页面
    const pageResult = await probeCurrentPage(driver, packageName, outputDir, options);
    pageResults.push(pageResult);
    visitedPages.add(currentPage);

    // 如果不是快速模式，尝试探索更多页面
    if (!options.quick) {
      const maxPages = parseInt(String(options.pages), 10) || 10;
      let pagesExplored = 1;

      // 尝试点击可交互元素探索新页面
      const interactiveElements = pageResult.interactiveElements.filter(
        e => e.clickable && e.visible && e.bounds.width > 50 && e.bounds.height > 30,
      );

      for (const element of interactiveElements.slice(0, 20)) {
        if (pagesExplored >= maxPages) break;

        try {
          // 点击元素
          const centerX = element.bounds.x + element.bounds.width / 2;
          const centerY = element.bounds.y + element.bounds.height / 2;

          await driver.touchAction([{ action: 'tap', x: centerX, y: centerY }]);
          await driver.pause(2000);

          // 检查是否进入新页面
          const newActivity = await driver.getCurrentActivity();
          if (!visitedPages.has(newActivity)) {
            visitedPages.add(newActivity);
            const newPageResult = await probeCurrentPage(driver, packageName, outputDir, options, pagesExplored);
            pageResults.push(newPageResult);
            pagesExplored++;

            // 返回上一页
            await driver.back();
            await driver.pause(1000);
          }
        } catch {
          // 忽略导航错误
        }
      }
    }

    // 生成探测结果
    const probeResult: ProbeResult = {
      runId: `probe-${Date.now()}`,
      timestamp: new Date().toISOString(),
      device: {
        id: deviceId,
      },
      pages: pageResults,
      detectedIssues: [],
      suggestedLocators: collectSuggestedLocators(pageResults),
      outputDir,
      durationMs: 0,
    };

    // 保存结果
    await saveProbeResult(probeResult, outputDir);

    // 生成报告
    await generateProbeReport(probeResult, outputDir);

    // 输出摘要
    console.log(chalk.green.bold('\n✅ 探测完成'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.white(`探测页面: ${pageResults.length} 个`));
    console.log(chalk.white(`交互元素: ${pageResults.reduce((sum, p) => sum + p.interactiveElements.length, 0)} 个`));
    console.log(chalk.white(`建议定位器: ${probeResult.suggestedLocators.length} 个`));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.cyan(`📁 输出目录: ${outputDir}`));
    console.log(chalk.cyan(`📄 HTML 报告: ${join(outputDir, 'reports', 'probe-report.html')}`));
    console.log(chalk.cyan(`📄 JSON 结果: ${join(outputDir, 'probe-result.json')}`));

    // 关闭驱动
    await driver.deleteSession();

  } catch (error) {
    console.log(chalk.red.bold('\n❌ 探测失败'));
    console.log(chalk.red((error as Error).message));
    logger.error('探测失败', { error: (error as Error).message });

    if (driver) {
      try {
        await driver.deleteSession();
      } catch {
        // 忽略
      }
    }

    process.exit(1);
  }
}

/**
 * 探测当前页面
 */
async function probeCurrentPage(
  driver: Browser,
  packageName: string,
  outputDir: string,
  options: ProbeCommandOptions,
  pageIndex: number = 0,
): Promise<ProbePageResult> {
  const activity = await driver.getCurrentActivity();
  const pageId = `page_${pageIndex}_${activity.replace(/\./g, '_')}`;

  logger.step(`🔍 探测页面: ${activity}`);

  // 截图
  const screenshotPath = join(outputDir, 'screenshots', `${pageId}.png`);
  const screenshot = await driver.takeScreenshot();
  const screenshotBuffer = Buffer.from(screenshot, 'base64');
  await writeFile(screenshotPath, screenshotBuffer);

  // 保存 page source
  const pageSourcePath = join(outputDir, 'page-sources', `${pageId}.xml`);
  const pageSource = await driver.getPageSource();
  await writeFile(pageSourcePath, pageSource, 'utf-8');

  // 获取可交互元素
  const interactiveElements = await extractInteractiveElements(driver);

  // 提取可见文本
  const visibleTexts = await extractVisibleTexts(driver);

  // 生成建议定位器
  const suggestedLocators = generateLocators(interactiveElements);

  logger.pass(`  ✓ 元素: ${interactiveElements.length}, 文本: ${visibleTexts.length}`);

  return {
    pageId,
    pageName: activity,
    activity,
    screenshotPath,
    pageSourcePath,
    interactiveElements,
    visibleTexts,
    issues: [],
  };
}

/**
 * 提取可交互元素
 */
async function extractInteractiveElements(driver: Browser): Promise<ProbeElement[]> {
  const elements: ProbeElement[] = [];

  try {
    // 获取所有可交互元素
    const allElements = await driver.$$(
      '//*[@clickable="true" or @scrollable="true" or @editable="true" or @focusable="true"]',
    );

    for (const element of allElements.slice(0, 100)) {
      try {
        const [
          className,
          text,
          contentDesc,
          resourceId,
          boundsStr,
          clickable,
          scrollable,
          editable,
          displayed,
        ] = await Promise.all([
          element.getAttribute('className'),
          element.getText().catch(() => ''),
          element.getAttribute('contentDescription').catch(() => ''),
          element.getAttribute('resourceId').catch(() => ''),
          element.getAttribute('bounds').catch(() => '[0,0][0,0]'),
          element.getAttribute('clickable').catch(() => 'false'),
          element.getAttribute('scrollable').catch(() => 'false'),
          element.getAttribute('editable').catch(() => 'false'),
          element.isDisplayed().catch(() => false),
        ]);

        const bounds = parseBounds(boundsStr);

        elements.push({
          type: getElementType(className),
          text: text || undefined,
          contentDesc: contentDesc || undefined,
          resourceId: resourceId || undefined,
          className: className || 'android.view.View',
          bounds,
          clickable: clickable === 'true',
          scrollable: scrollable === 'true',
          editable: editable === 'true',
          visible: displayed,
          suggestedLocators: [],
        });
      } catch {
        // 忽略单个元素错误
      }
    }
  } catch (error) {
    logger.warn(`提取元素失败: ${(error as Error).message}`);
  }

  // 为每个元素生成建议定位器
  for (const element of elements) {
    element.suggestedLocators = generateElementLocators(element);
  }

  return elements;
}

/**
 * 解析 bounds 字符串
 */
function parseBounds(boundsStr: string): { x: number; y: number; width: number; height: number } {
  const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (match && match[1] && match[2] && match[3] && match[4]) {
    const x1 = parseInt(match[1], 10);
    const y1 = parseInt(match[2], 10);
    const x2 = parseInt(match[3], 10);
    const y2 = parseInt(match[4], 10);
    return {
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
    };
  }
  return { x: 0, y: 0, width: 0, height: 0 };
}

/**
 * 获取元素类型
 */
function getElementType(className: string): string {
  if (!className) return 'View';
  const parts = className.split('.');
  return parts[parts.length - 1] || 'View';
}

/**
 * 提取可见文本
 */
async function extractVisibleTexts(driver: Browser): Promise<string[]> {
  const texts: string[] = [];

  try {
    const textElements = await driver.$$('//*[@text!=""]');

    for (const element of textElements.slice(0, 200)) {
      try {
        const text = await element.getText();
        if (text && text.trim()) {
          texts.push(text.trim());
        }
      } catch {
        // 忽略
      }
    }
  } catch {
    // 忽略
  }

  return texts;
}

/**
 * 生成元素定位器建议
 */
function generateElementLocators(element: ProbeElement): SuggestedLocator[] {
  const locators: SuggestedLocator[] = [];

  // Resource ID（最推荐）
  if (element.resourceId) {
    locators.push({
      strategy: 'id',
      value: element.resourceId,
      confidence: 0.95,
      reason: 'Resource ID 是最稳定的定位方式',
      recommended: true,
    });
  }

  // Accessibility ID
  if (element.contentDesc) {
    locators.push({
      strategy: 'accessibility-id',
      value: element.contentDesc,
      confidence: 0.9,
      reason: 'Content Description 通常唯一且稳定',
      recommended: !element.resourceId,
    });
  }

  // 文本定位
  if (element.text) {
    locators.push({
      strategy: 'text',
      value: element.text,
      confidence: 0.7,
      reason: '文本定位简单但可能随语言变化',
      recommended: false,
    });
  }

  // XPath（最后选择）
  if (element.className) {
    const xpath = element.text
      ? `//${element.className.split('.').pop()}[@text="${element.text}"]`
      : `//${element.className.split('.').pop()}[@clickable="true"]`;

    locators.push({
      strategy: 'xpath',
      value: xpath,
      confidence: 0.5,
      reason: 'XPath 可能脆弱，建议使用更具体的定位器',
      recommended: false,
    });
  }

  return locators;
}

/**
 * 生成页面元素的定位器建议
 */
function generateLocators(elements: ProbeElement[]): SuggestedLocator[] {
  const locators: SuggestedLocator[] = [];

  for (const element of elements) {
    locators.push(...element.suggestedLocators);
  }

  // 按置信度排序
  return locators.sort((a, b) => b.confidence - a.confidence);
}

/**
 * 收集所有建议的定位器
 */
function collectSuggestedLocators(pages: ProbePageResult[]): SuggestedLocator[] {
  const allLocators: SuggestedLocator[] = [];

  for (const page of pages) {
    for (const element of page.interactiveElements) {
      allLocators.push(...element.suggestedLocators);
    }
  }

  // 去重并排序
  const seen = new Set<string>();
  return allLocators.filter(locator => {
    const key = `${locator.strategy}:${locator.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => b.confidence - a.confidence);
}

/**
 * 保存探测结果
 */
async function saveProbeResult(result: ProbeResult, outputDir: string): Promise<void> {
  const jsonPath = join(outputDir, 'probe-result.json');
  await writeFile(jsonPath, JSON.stringify(result, null, 2), 'utf-8');
  logger.debug(`探测结果已保存: ${jsonPath}`);
}

/**
 * 生成探测报告
 */
async function generateProbeReport(result: ProbeResult, outputDir: string): Promise<void> {
  const reportPath = join(outputDir, 'reports', 'probe-report.html');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>页面探测报告 - ${result.runId}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h1 { color: #1890ff; border-bottom: 2px solid #1890ff; padding-bottom: 10px; }
    h2 { color: #333; margin-top: 30px; }
    .meta { color: #666; font-size: 14px; }
    .page-card {
      border: 1px solid #ddd;
      border-radius: 8px;
      margin: 20px 0;
      padding: 15px;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    .page-name { font-weight: bold; font-size: 16px; }
    .element-count { color: #666; font-size: 14px; }
    .screenshot {
      max-width: 300px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    .element-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 13px;
    }
    .element-table th, .element-table td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    .element-table th { background: #f5f5f5; }
    .locator {
      font-family: monospace;
      font-size: 12px;
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      display: inline-block;
      margin: 2px;
    }
    .locator.id { color: #52c41a; }
    .locator.accessibility-id { color: #1890ff; }
    .locator.text { color: #faad14; }
    .locator.xpath { color: #8c8c8c; }
    .recommended { font-weight: bold; }
    .text-list {
      max-height: 200px;
      overflow-y: auto;
      background: #f9f9f9;
      padding: 10px;
      border-radius: 4px;
      font-size: 13px;
    }
    .text-item { margin: 3px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 页面探测报告</h1>
    <div class="meta">
      <p>运行 ID: ${result.runId}</p>
      <p>探测时间: ${result.timestamp}</p>
      <p>设备: ${result.device.id}</p>
      <p>探测页面: ${result.pages.length} 个</p>
      <p>建议定位器: ${result.suggestedLocators.length} 个</p>
    </div>

    <h2>📱 探测页面</h2>
    ${result.pages.map(page => `
      <div class="page-card">
        <div class="page-header">
          <span class="page-name">${page.pageName}</span>
          <span class="element-count">${page.interactiveElements.length} 个可交互元素</span>
        </div>
        <div style="display: flex; gap: 20px;">
          <div>
            <a href="../${page.screenshotPath.replace(outputDir, '')}" target="_blank">
              <img src="../${page.screenshotPath.replace(outputDir, '')}" class="screenshot" alt="截图">
            </a>
            <p style="font-size: 12px; color: #666; margin-top: 5px;">
              <a href="../${page.pageSourcePath.replace(outputDir, '')}" target="_blank">查看 Page Source</a>
            </p>
          </div>
          <div style="flex: 1;">
            <h3>可交互元素</h3>
            <table class="element-table">
              <thead>
                <tr>
                  <th>类型</th>
                  <th>文本</th>
                  <th>Resource ID</th>
                  <th>建议定位器</th>
                </tr>
              </thead>
              <tbody>
                ${page.interactiveElements.slice(0, 20).map(el => `
                  <tr>
                    <td>${el.type}</td>
                    <td>${el.text || '-'}</td>
                    <td>${el.resourceId || '-'}</td>
                    <td>
                      ${el.suggestedLocators.map(loc => `
                        <span class="locator ${loc.strategy} ${loc.recommended ? 'recommended' : ''}">
                          ${loc.strategy}: ${loc.value.substring(0, 30)}${loc.value.length > 30 ? '...' : ''}
                        </span>
                      `).join('')}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            ${page.interactiveElements.length > 20 ? `<p style="color: #666; font-size: 12px;">还有 ${page.interactiveElements.length - 20} 个元素未显示</p>` : ''}

            <h3 style="margin-top: 15px;">可见文本</h3>
            <div class="text-list">
              ${page.visibleTexts.map(t => `<div class="text-item">${escapeHtml(t)}</div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `).join('')}

    <h2>📍 推荐定位器</h2>
    <table class="element-table">
      <thead>
        <tr>
          <th>策略</th>
          <th>值</th>
          <th>置信度</th>
          <th>推荐原因</th>
        </tr>
      </thead>
      <tbody>
        ${result.suggestedLocators.slice(0, 50).map(loc => `
          <tr>
            <td><span class="locator ${loc.strategy}">${loc.strategy}</span></td>
            <td style="font-family: monospace; font-size: 12px;">${escapeHtml(loc.value)}</td>
            <td>${(loc.confidence * 100).toFixed(0)}%</td>
            <td>${loc.reason}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;

  await writeFile(reportPath, html, 'utf-8');
  logger.debug(`探测报告已生成: ${reportPath}`);
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
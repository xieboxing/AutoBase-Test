/**
 * APP 全面自动化测试脚本 (ADB 版本)
 * 使用 ADB 和 UIAutomator 直接测试，无需 Appium
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

const execAsync = promisify(exec);

const APP_PACKAGE = 'com.get.rich';
const APP_ACTIVITY = 'com.lkandzs.imtx.app.activity.ImMainActivity';
const DEVICE_ID = 'emulator-5554';
const ADB_PATH = 'C:\\Users\\Huayao002\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';

// 测试结果收集
const testResults = {
  pages: [] as any[],
  actions: [] as any[],
  errors: [] as any[],
  screenshots: [] as string[],
  startTime: new Date().toISOString(),
  endTime: '',
};

// 已访问的页面
const visitedPages = new Set<string>();
// 已点击的元素
const clickedElements = new Set<string>();

/**
 * 执行 ADB 命令
 */
async function adb(cmd: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`"${ADB_PATH}" -s ${DEVICE_ID} ${cmd}`, { timeout: 30000 });
    return stdout;
  } catch (error: any) {
    return error.stdout || error.message;
  }
}

/**
 * 保存截图
 */
async function saveScreenshot(name: string): Promise<string> {
  const screenshotDir = './data/screenshots';
  await fs.mkdir(screenshotDir, { recursive: true });

  const filename = `app-full-${name}-${Date.now()}.png`;
  const filepath = path.join(screenshotDir, filename);

  try {
    await adb(`shell screencap -p /sdcard/test.png`);
    await execAsync(`"${ADB_PATH}" -s ${DEVICE_ID} pull /sdcard/test.png "${filepath}"`);
    await adb(`shell rm /sdcard/test.png`);
    testResults.screenshots.push(filepath);
    console.log(chalk.gray(`  📸 截图: ${filename}`));
    return filepath;
  } catch (error) {
    console.log(chalk.yellow(`  ⚠ 截图失败`));
    return '';
  }
}

/**
 * 获取当前 Activity
 */
async function getCurrentActivity(): Promise<string> {
  try {
    const output = await adb(`shell dumpsys activity activities | grep mResumedActivity`);
    const match = output.match(/([a-zA-Z0-9.]+\/[a-zA-Z0-9.]+)/);
    return match ? match[1] : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * 获取当前页面的 UI 元素
 */
async function getUiElements(): Promise<any[]> {
  try {
    // 使用 uiautomator dump 获取 UI 层级
    await adb(`shell uiautomator dump /sdcard/ui.xml`);
    const output = await adb(`shell cat /sdcard/ui.xml`);

    // 解析 XML 获取可点击元素
    const elements: any[] = [];

    // 提取可点击的元素
    const clickableRegex = /<node[^>]*clickable="true"[^>]*text="([^"]*)"[^>]*resource-id="([^"]*)"[^>]*bounds="\[(\d+,\d+)\]\[(\d+,\d+)\]"[^>]*\/>/g;
    let match;
    while ((match = clickableRegex.exec(output)) !== null) {
      elements.push({
        type: 'clickable',
        text: match[1] || '',
        resourceId: match[2] || '',
        bounds: match[3] + '-' + match[4],
      });
    }

    // 提取可编辑元素
    const editableRegex = /<node[^>]*editable="true"[^>]*text="([^"]*)"[^>]*resource-id="([^"]*)"[^>]*bounds="\[(\d+,\d+)\]\[(\d+,\d+)\]"[^>]*\/>/g;
    while ((match = editableRegex.exec(output)) !== null) {
      elements.push({
        type: 'editable',
        text: match[1] || '',
        resourceId: match[2] || '',
        bounds: match[3] + '-' + match[4],
      });
    }

    // 提取所有文本元素
    const textRegex = /<node[^>]*text="([^"]+)"[^>]*\/>/g;
    while ((match = textRegex.exec(output)) !== null) {
      if (match[1] && match[1].length > 0 && match[1].length < 30) {
        elements.push({
          type: 'text',
          text: match[1],
        });
      }
    }

    return elements;
  } catch (error) {
    console.log(chalk.yellow(`  ⚠ 获取 UI 元素失败`));
    return [];
  }
}

/**
 * 点击屏幕坐标
 */
async function tapAt(x: number, y: number): Promise<void> {
  await adb(`shell input tap ${x} ${y}`);
}

/**
 * 点击元素
 */
async function clickElement(element: any): Promise<boolean> {
  const key = element.resourceId || element.text || element.bounds;
  if (clickedElements.has(key)) {
    return false;
  }
  clickedElements.add(key);

  try {
    // 解析 bounds 获取中心点
    if (element.bounds) {
      const match = element.bounds.match(/(\d+),(\d+)-(\d+),(\d+)/);
      if (match) {
        const x1 = parseInt(match[1]);
        const y1 = parseInt(match[2]);
        const x2 = parseInt(match[3]);
        const y2 = parseInt(match[4]);
        const centerX = Math.floor((x1 + x2) / 2);
        const centerY = Math.floor((y1 + y2) / 2);

        console.log(chalk.blue(`  👆 点击: ${element.text || element.resourceId || '未知'} (${centerX}, ${centerY})`));
        await tapAt(centerX, centerY);
        await new Promise((r) => setTimeout(r, 1500));

        testResults.actions.push({
          type: 'click',
          target: element.text || element.resourceId,
          bounds: element.bounds,
          timestamp: new Date().toISOString(),
        });

        return true;
      }
    }
    return false;
  } catch (error: any) {
    console.log(chalk.red(`  ✗ 点击失败: ${error.message}`));
    testResults.errors.push({
      action: 'click',
      target: element.text || element.resourceId,
      error: error.message,
    });
    return false;
  }
}

/**
 * 输入文本
 */
async function inputText(text: string): Promise<void> {
  await adb(`shell input text "${text}"`);
}

/**
 * 按键
 */
async function pressKey(keyCode: number): Promise<void> {
  await adb(`shell input keyevent ${keyCode}`);
}

/**
 * 探索页面
 */
async function explorePage(depth: number = 0, maxDepth: number = 2): Promise<void> {
  if (depth > maxDepth) {
    return;
  }

  const indent = '  '.repeat(depth);
  console.log(chalk.cyan(`${indent}📄 探索页面 (深度: ${depth})`));

  // 获取当前 Activity
  const activity = await getCurrentActivity();
  console.log(chalk.gray(`${indent}  当前页面: ${activity}`));

  // 如果已访问过此页面，跳过
  if (visitedPages.has(activity)) {
    console.log(chalk.gray(`${indent}  已访问过，跳过`));
    return;
  }
  visitedPages.add(activity);

  // 截图
  const screenshot = await saveScreenshot(`page-${depth}-${activity.replace(/\./g, '_').replace(/\//g, '-')}`);

  // 获取 UI 元素
  const elements = await getUiElements();
  console.log(chalk.gray(`${indent}  发现 ${elements.length} 个可交互元素`));

  // 记录页面信息
  testResults.pages.push({
    activity,
    depth,
    elementCount: elements.length,
    screenshot,
    elements: elements.slice(0, 20).map((e) => ({
      type: e.type,
      text: e.text,
      resourceId: e.resourceId,
    })),
  });

  // 过滤掉需要跳过的元素
  const skipKeywords = ['返回', '关闭', 'back', 'close', '取消', 'cancel'];
  const filteredElements = elements.filter((e) => {
    const text = (e.text + e.resourceId).toLowerCase();
    return !skipKeywords.some((k) => text.includes(k));
  });

  // 点击元素并探索
  let clickCount = 0;
  for (const element of filteredElements) {
    if (clickCount >= 5) break; // 每个页面最多点击5个元素

    if (element.type === 'clickable') {
      const clicked = await clickElement(element);

      if (clicked) {
        clickCount++;
        await new Promise((r) => setTimeout(r, 2000));

        // 检查页面是否变化
        const newActivity = await getCurrentActivity();
        if (newActivity !== activity) {
          // 递归探索新页面
          await explorePage(depth + 1, maxDepth);

          // 返回上一页
          await pressKey(4); // KEYCODE_BACK
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  }
}

/**
 * 测试底部导航
 */
async function testBottomNavigation(): Promise<void> {
  console.log(chalk.magenta('\n📑 探索底部导航栏...'));

  // 常见导航按钮位置（底部）
  const navPositions = [
    { name: '首页', x: 180, y: 2300 },
    { name: '行情', x: 360, y: 2300 },
    { name: '交易', x: 540, y: 2300 },
    { name: '资产', x: 720, y: 2300 },
    { name: '我的', x: 900, y: 2300 },
  ];

  for (const nav of navPositions) {
    console.log(chalk.blue(`  👆 点击导航: ${nav.name}`));
    await tapAt(nav.x, nav.y);
    await new Promise((r) => setTimeout(r, 2000));

    const activity = await getCurrentActivity();
    const screenshot = await saveScreenshot(`nav-${nav.name}`);

    const elements = await getUiElements();
    testResults.pages.push({
      activity,
      navTab: nav.name,
      elementCount: elements.length,
      screenshot,
    });

    testResults.actions.push({
      type: 'navigation',
      target: nav.name,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * 测试登录功能
 */
async function testLogin(): Promise<void> {
  console.log(chalk.magenta('\n🔐 测试登录功能...'));

  // 先点击"我的"导航
  await tapAt(900, 2300);
  await new Promise((r) => setTimeout(r, 2000));
  await saveScreenshot('login-my-page');

  // 查找登录入口
  const elements = await getUiElements();
  const loginElements = elements.filter(
    (e) =>
      (e.text && (e.text.includes('登录') || e.text.includes('登陆'))) ||
      (e.resourceId && e.resourceId.toLowerCase().includes('login')),
  );

  console.log(chalk.gray(`  发现 ${loginElements.length} 个登录相关元素`));

  if (loginElements.length > 0) {
    // 点击登录入口
    for (const el of loginElements) {
      if (el.bounds) {
        const match = el.bounds.match(/(\d+),(\d+)-(\d+),(\d+)/);
        if (match) {
          const x = Math.floor((parseInt(match[1]) + parseInt(match[3])) / 2);
          const y = Math.floor((parseInt(match[2]) + parseInt(match[4])) / 2);
          console.log(chalk.blue(`  👆 点击登录入口: ${el.text}`));
          await tapAt(x, y);
          await new Promise((r) => setTimeout(r, 2000));
          break;
        }
      }
    }

    await saveScreenshot('login-page');

    // 尝试输入测试账号
    const editables = elements.filter((e) => e.type === 'editable');
    console.log(chalk.gray(`  发现 ${editables.length} 个输入框`));

    // 点击第一个输入框并输入手机号
    if (editables.length > 0) {
      const firstInput = editables[0];
      if (firstInput.bounds) {
        const match = firstInput.bounds.match(/(\d+),(\d+)-(\d+),(\d+)/);
        if (match) {
          const x = Math.floor((parseInt(match[1]) + parseInt(match[3])) / 2);
          const y = Math.floor((parseInt(match[2]) + parseInt(match[4])) / 2);
          await tapAt(x, y);
          await new Promise((r) => setTimeout(r, 500));
          await inputText('13800138000');
          console.log(chalk.blue(`  ⌨️ 输入手机号: 13800138000`));
        }
      }
    }

    await saveScreenshot('login-filled');
    testResults.actions.push({
      type: 'login-test',
      description: '登录功能测试',
      timestamp: new Date().toISOString(),
    });
  } else {
    console.log(chalk.yellow('  未找到登录入口'));
  }
}

/**
 * 测试交易功能
 */
async function testTransaction(): Promise<void> {
  console.log(chalk.magenta('\n💰 测试交易功能...'));

  // 点击交易导航
  await tapAt(540, 2300);
  await new Promise((r) => setTimeout(r, 2000));
  await saveScreenshot('transaction-page');

  const elements = await getUiElements();
  console.log(chalk.gray(`  发现 ${elements.length} 个元素`));

  // 查找交易相关元素
  const transactionKeywords = ['买入', '卖出', '交易', '下单', '购买'];
  const transactionElements = elements.filter((e) =>
    transactionKeywords.some((k) => e.text?.includes(k)),
  );

  console.log(chalk.gray(`  发现 ${transactionElements.length} 个交易相关元素`));

  // 点击第一个交易元素
  if (transactionElements.length > 0) {
    const firstEl = transactionElements[0];
    if (firstEl.bounds) {
      const match = firstEl.bounds.match(/(\d+),(\d+)-(\d+),(\d+)/);
      if (match) {
        const x = Math.floor((parseInt(match[1]) + parseInt(match[3])) / 2);
        const y = Math.floor((parseInt(match[2]) + parseInt(match[4])) / 2);
        console.log(chalk.blue(`  👆 点击交易: ${firstEl.text}`));
        await tapAt(x, y);
        await new Promise((r) => setTimeout(r, 2000));
        await saveScreenshot('transaction-detail');
      }
    }
  }

  testResults.actions.push({
    type: 'transaction-test',
    description: '交易功能测试',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Monkey 随机测试
 */
async function runMonkeyTest(iterations: number = 20): Promise<void> {
  console.log(chalk.magenta(`\n🐒 执行 Monkey 测试 (${iterations} 次随机操作)...`));

  for (let i = 0; i < iterations; i++) {
    const action = Math.floor(Math.random() * 4);

    try {
      switch (action) {
        case 0: // 随机点击
          const x = Math.floor(Math.random() * 1000) + 40;
          const y = Math.floor(Math.random() * 2100) + 100;
          console.log(chalk.gray(`  🎲 随机点击 (${x}, ${y})`));
          await tapAt(x, y);
          break;
        case 1: // 滑动
          const startY = Math.floor(Math.random() * 1000) + 500;
          const endY = startY - 300;
          console.log(chalk.gray(`  🎲 向上滑动`));
          await adb(`shell input swipe 540 ${startY} 540 ${endY} 300`);
          break;
        case 2: // 返回
          console.log(chalk.gray(`  🎲 按返回键`));
          await pressKey(4);
          break;
        case 3: // 随机按键
          const keyCodes = [3, 4, 24, 25, 82]; // HOME, BACK, VOL_UP, VOL_DOWN, MENU
          const key = keyCodes[Math.floor(Math.random() * keyCodes.length)];
          await pressKey(key);
          break;
      }

      await new Promise((r) => setTimeout(r, 1000));

      // 每5次操作截图一次
      if (i % 5 === 0) {
        await saveScreenshot(`monkey-${i}`);
      }
    } catch (error) {
      // 忽略错误继续
    }
  }

  testResults.actions.push({
    type: 'monkey-test',
    iterations,
    timestamp: new Date().toISOString(),
  });
}

/**
 * 生成报告
 */
async function generateReport(): Promise<void> {
  testResults.endTime = new Date().toISOString();

  // 保存 JSON 报告
  const reportPath = './data/reports/app-full-test-report.json';
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(testResults, null, 2));

  // 生成 HTML 报告
  const htmlReport = generateHtmlReport();
  const htmlPath = './data/reports/app-full-test-report.html';
  await fs.writeFile(htmlPath, htmlReport);

  console.log(chalk.gray(`\n📝 测试报告已保存:`));
  console.log(chalk.gray(`  - ${reportPath}`));
  console.log(chalk.gray(`  - ${htmlPath}`));
}

/**
 * 生成 HTML 报告
 */
function generateHtmlReport(): string {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>APP 全面测试报告</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
    .summary-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
    .summary-card .number { font-size: 36px; font-weight: bold; color: #4CAF50; }
    .summary-card .label { color: #666; margin-top: 5px; }
    .page-list { list-style: none; padding: 0; }
    .page-list li { padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; }
    .screenshot { max-width: 300px; border: 1px solid #ddd; border-radius: 4px; margin: 5px; }
    .screenshots-grid { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0; }
    .action-list { max-height: 400px; overflow-y: auto; }
    .action-item { padding: 8px; background: #f8f9fa; margin: 5px 0; border-radius: 4px; font-size: 14px; }
    .error { color: #f44336; }
    .success { color: #4CAF50; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📱 APP 全面自动化测试报告</h1>

    <div class="summary">
      <div class="summary-card">
        <div class="number">${testResults.pages.length}</div>
        <div class="label">探索页面数</div>
      </div>
      <div class="summary-card">
        <div class="number">${testResults.actions.length}</div>
        <div class="label">执行动作数</div>
      </div>
      <div class="summary-card">
        <div class="number">${testResults.screenshots.length}</div>
        <div class="label">截图数量</div>
      </div>
      <div class="summary-card">
        <div class="number">${testResults.errors.length}</div>
        <div class="label">错误数量</div>
      </div>
    </div>

    <h2>📑 探索的页面</h2>
    <ul class="page-list">
      ${testResults.pages.map((p) => `<li><span>${p.activity || p.navTab}</span><span>${p.elementCount} 个元素</span></li>`).join('')}
    </ul>

    <h2>📸 测试截图</h2>
    <div class="screenshots-grid">
      ${testResults.screenshots.map((s) => `<img src="../${s.replace('./', '')}" class="screenshot" alt="截图">`).join('')}
    </div>

    <h2>👆 执行的动作</h2>
    <div class="action-list">
      ${testResults.actions.map((a) => `<div class="action-item"><span class="success">✓</span> ${a.type}: ${a.target || a.description || ''}</div>`).join('')}
    </div>

    ${testResults.errors.length > 0 ? `
    <h2>❌ 错误列表</h2>
    <div class="action-list">
      ${testResults.errors.map((e) => `<div class="action-item"><span class="error">✗</span> ${e.action}: ${e.error}</div>`).join('')}
    </div>
    ` : ''}

    <p style="color: #666; margin-top: 30px; text-align: center;">
      测试时间: ${testResults.startTime} - ${testResults.endTime}
    </p>
  </div>
</body>
</html>
`;
}

/**
 * 主测试函数
 */
async function runFullTest(): Promise<void> {
  console.log(chalk.bold.blue('\n🚀 开始 APP 全面自动化测试 (ADB 版本)\n'));
  console.log(chalk.gray('━'.repeat(50)));

  try {
    // 启动应用
    console.log(chalk.cyan('\n📱 启动应用...'));
    await adb(`shell am start -n ${APP_PACKAGE}/${APP_ACTIVITY}`);
    await new Promise((r) => setTimeout(r, 3000));

    // 截图初始状态
    await saveScreenshot('initial');

    // 1. 测试底部导航
    await testBottomNavigation();

    // 2. 深度探索页面
    console.log(chalk.magenta('\n🔍 深度探索页面...'));
    await explorePage(0, 2);

    // 3. 测试登录功能
    await testLogin();

    // 4. 测试交易功能
    await testTransaction();

    // 5. Monkey 随机测试
    await runMonkeyTest(15);

    console.log(chalk.gray('\n━'.repeat(50)));
    console.log(chalk.bold.green('\n✅ 测试完成!\n'));

    // 输出统计
    console.log(chalk.white(`📄 探索页面数: ${testResults.pages.length}`));
    console.log(chalk.white(`👆 执行动作数: ${testResults.actions.length}`));
    console.log(chalk.white(`📸 截图数量: ${testResults.screenshots.length}`));
    console.log(chalk.white(`❌ 错误数量: ${testResults.errors.length}`));

    // 生成报告
    await generateReport();
  } catch (error: any) {
    console.log(chalk.red(`\n❌ 测试失败: ${error.message}`));
    testResults.errors.push({
      action: 'main',
      error: error.message,
    });
    await generateReport();
  }
}

// 运行测试
runFullTest().catch(console.error);
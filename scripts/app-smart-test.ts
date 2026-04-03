/**
 * APP 智能全面测试脚本
 * 基于实际界面元素进行测试
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

// 测试结果
const results = {
  pages: [] as any[],
  actions: [] as any[],
  errors: [] as any[],
  screenshots: [] as string[],
  startTime: new Date().toISOString(),
};

// 屏幕尺寸
const SCREEN_WIDTH = 1080;
const SCREEN_HEIGHT = 2400;

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
 * 截图
 */
async function screenshot(name: string): Promise<string> {
  const dir = './data/screenshots';
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `test-${name}-${Date.now()}.png`);
  try {
    await adb(`shell screencap -p /sdcard/s.png`);
    await execAsync(`"${ADB_PATH}" -s ${DEVICE_ID} pull /sdcard/s.png "${file}"`);
    await adb(`shell rm /sdcard/s.png`);
    results.screenshots.push(file);
    console.log(chalk.gray(`  📸 ${name}`));
    return file;
  } catch {
    return '';
  }
}

/**
 * 点击坐标
 */
async function tap(x: number, y: number): Promise<void> {
  await adb(`shell input tap ${x} ${y}`);
  await sleep(800);
}

/**
 * 输入文本
 */
async function type(text: string): Promise<void> {
  // 使用 adb shell input text 需要转换特殊字符
  const escaped = text.replace(/ /g, '%s').replace(/&/g, '\\&');
  await adb(`shell input text "${escaped}"`);
}

/**
 * 按键
 */
async function key(keyCode: number): Promise<void> {
  await adb(`shell input keyevent ${keyCode}`);
  await sleep(500);
}

/**
 * 滑动
 */
async function swipe(x1: number, y1: number, x2: number, y2: number, duration: number = 300): Promise<void> {
  await adb(`shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`);
  await sleep(500);
}

/**
 * 等待
 */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 获取 UI 元素
 */
async function getUiElements(): Promise<any[]> {
  try {
    await adb(`shell uiautomator dump /sdcard/ui.xml`);
    const xml = await adb(`shell cat /sdcard/ui.xml`);
    const elements: any[] = [];

    // 解析可点击元素
    const nodeRegex = /<node[^>]*text="([^"]*)"[^>]*resource-id="([^"]*)"[^>]*clickable="([^"]*)"[^>]*bounds="\[(\d+,\d+)\]\[(\d+,\d+)\]"[^>]*\/>/g;
    let match;
    while ((match = nodeRegex.exec(xml)) !== null) {
      const text = match[1] || '';
      const resourceId = match[2] || '';
      const clickable = match[3] === 'true';
      const bounds = match[4] + '-' + match[5];

      if (clickable || text) {
        const [x1, y1] = match[4].split(',').map(Number);
        const [x2, y2] = match[5].split(',').map(Number);
        elements.push({
          text,
          resourceId,
          clickable,
          bounds,
          x: Math.floor((x1 + x2) / 2),
          y: Math.floor((y1 + y2) / 2),
          width: x2 - x1,
          height: y2 - y1,
        });
      }
    }

    return elements;
  } catch {
    return [];
  }
}

/**
 * 查找并点击元素
 */
async function findAndClick(textOrId: string): Promise<boolean> {
  const elements = await getUiElements();
  const found = elements.find(
    (e) =>
      e.text.toLowerCase().includes(textOrId.toLowerCase()) ||
      e.resourceId.toLowerCase().includes(textOrId.toLowerCase())
  );

  if (found) {
    console.log(chalk.blue(`  👆 点击: ${found.text || found.resourceId}`));
    await tap(found.x, found.y);
    results.actions.push({ type: 'click', target: found.text || found.resourceId, time: new Date().toISOString() });
    return true;
  }
  return false;
}

/**
 * 测试主页面导航
 */
async function testMainNavigation(): Promise<void> {
  console.log(chalk.cyan('\n📑 测试底部导航'));

  // 底部导航栏位置 (根据截图)
  const navItems = [
    { name: '首页', x: 200, y: 2320 },
    { name: '行情', x: 400, y: 2320 },
    { name: '交易', x: 540, y: 2320 },
    { name: '资产', x: 700, y: 2320 },
    { name: '我的', x: 900, y: 2320 },
  ];

  for (const nav of navItems) {
    console.log(chalk.blue(`  👆 点击: ${nav.name}`));
    await tap(nav.x, nav.y);
    await sleep(1500);
    await screenshot(`nav-${nav.name}`);
    results.pages.push({ page: nav.name, type: 'navigation' });
  }
}

/**
 * 测试登录功能
 */
async function testLogin(): Promise<void> {
  console.log(chalk.cyan('\n🔐 测试登录功能'));

  // 1. 先到"我的"页面
  await tap(900, 2320);
  await sleep(1500);
  await screenshot('login-1-我的页面');

  // 2. 点击"点击登录"按钮 (根据截图位置)
  console.log(chalk.blue('  👆 点击登录入口'));
  await tap(540, 400); // 点击登录按钮位置
  await sleep(2000);
  await screenshot('login-2-登录页面');

  // 3. 查找输入框并输入
  const elements = await getUiElements();
  console.log(chalk.gray(`  发现 ${elements.length} 个元素`));

  // 查找手机号输入框
  const phoneInput = elements.find(
    (e) =>
      e.resourceId.includes('phone') ||
      e.resourceId.includes('mobile') ||
      e.text.includes('手机') ||
      (e.width > 400 && e.height < 100 && !e.clickable)
  );

  if (phoneInput) {
    console.log(chalk.blue('  ⌨️ 输入手机号'));
    await tap(phoneInput.x, phoneInput.y);
    await sleep(500);
    await type('13800138000');
    await sleep(500);
  }

  // 查找密码输入框
  const passInput = elements.find(
    (e) =>
      e.resourceId.includes('password') ||
      e.resourceId.includes('pwd') ||
      e.text.includes('密码')
  );

  if (passInput) {
    console.log(chalk.blue('  ⌨️ 输入密码'));
    await tap(passInput.x, passInput.y);
    await sleep(500);
    await type('Test123456');
    await sleep(500);
  }

  await screenshot('login-3-已填写');

  // 4. 点击登录按钮
  const loginBtn = elements.find(
    (e) =>
      e.text.includes('登录') ||
      e.text.includes('Login') ||
      e.text.includes('确定') ||
      e.resourceId.includes('login') ||
      e.resourceId.includes('submit')
  );

  if (loginBtn) {
    console.log(chalk.blue(`  👆 点击登录按钮: ${loginBtn.text}`));
    await tap(loginBtn.x, loginBtn.y);
    await sleep(3000);
    await screenshot('login-4-登录结果');
  }

  results.actions.push({ type: 'login-test', description: '登录功能测试', time: new Date().toISOString() });
}

/**
 * 测试交易功能
 */
async function testTransaction(): Promise<void> {
  console.log(chalk.cyan('\n💰 测试交易功能'));

  // 1. 点击交易导航
  await tap(540, 2320);
  await sleep(1500);
  await screenshot('trade-1-交易页面');

  // 2. 获取页面元素
  const elements = await getUiElements();
  console.log(chalk.gray(`  发现 ${elements.length} 个元素`));

  // 3. 查找交易相关按钮
  const tradeButtons = elements.filter(
    (e) =>
      e.text.includes('买入') ||
      e.text.includes('卖出') ||
      e.text.includes('交易') ||
      e.text.includes('下单')
  );

  console.log(chalk.gray(`  发现 ${tradeButtons.length} 个交易按钮`));

  // 4. 点击买入按钮
  const buyBtn = tradeButtons.find((e) => e.text.includes('买入'));
  if (buyBtn) {
    console.log(chalk.blue(`  👆 点击: ${buyBtn.text}`));
    await tap(buyBtn.x, buyBtn.y);
    await sleep(2000);
    await screenshot('trade-2-买入页面');

    // 查找金额输入框
    const amountInput = elements.find(
      (e) =>
        e.resourceId.includes('amount') ||
        e.resourceId.includes('num') ||
        e.text.includes('金额') ||
        e.text.includes('数量')
    );

    if (amountInput) {
      console.log(chalk.blue('  ⌨️ 输入金额'));
      await tap(amountInput.x, amountInput.y);
      await type('100');
      await sleep(500);
    }

    await screenshot('trade-3-已填写');
    results.actions.push({ type: 'trade-test', description: '交易功能测试', time: new Date().toISOString() });

    // 返回
    await key(4);
    await sleep(1000);
  }
}

/**
 * 测试资产页面
 */
async function testAssets(): Promise<void> {
  console.log(chalk.cyan('\n📊 测试资产页面'));

  await tap(700, 2320);
  await sleep(1500);
  await screenshot('assets-1-资产页面');

  const elements = await getUiElements();
  console.log(chalk.gray(`  发现 ${elements.length} 个元素`));

  // 查找充值/提现按钮
  const actionBtns = elements.filter(
    (e) =>
      e.text.includes('充值') ||
      e.text.includes('提现') ||
      e.text.includes('转账')
  );

  for (const btn of actionBtns.slice(0, 2)) {
    console.log(chalk.blue(`  👆 点击: ${btn.text}`));
    await tap(btn.x, btn.y);
    await sleep(2000);
    await screenshot(`assets-2-${btn.text}`);
    await key(4);
    await sleep(1000);
  }

  results.actions.push({ type: 'assets-test', description: '资产页面测试', time: new Date().toISOString() });
}

/**
 * 测试行情页面
 */
async function testMarket(): Promise<void> {
  console.log(chalk.cyan('\n📈 测试行情页面'));

  await tap(400, 2320);
  await sleep(1500);
  await screenshot('market-1-行情页面');

  const elements = await getUiElements();
  console.log(chalk.gray(`  发现 ${elements.length} 个元素`));

  // 点击一个交易对
  const tradingPairs = elements.filter(
    (e) =>
      e.text.includes('/USDT') ||
      e.text.includes('USDT') ||
      e.text.includes('BTC') ||
      e.text.includes('ETH')
  );

  if (tradingPairs.length > 0) {
    const pair = tradingPairs[0];
    console.log(chalk.blue(`  👆 点击交易对: ${pair.text}`));
    await tap(pair.x, pair.y);
    await sleep(2000);
    await screenshot('market-2-交易对详情');
    await key(4);
    await sleep(1000);
  }

  results.actions.push({ type: 'market-test', description: '行情页面测试', time: new Date().toISOString() });
}

/**
 * Monkey 随机测试
 */
async function monkeyTest(count: number = 30): Promise<void> {
  console.log(chalk.cyan(`\n🐒 Monkey 测试 (${count}次)`));

  for (let i = 0; i < count; i++) {
    const action = Math.floor(Math.random() * 5);
    try {
      switch (action) {
        case 0: {
          const x = 100 + Math.floor(Math.random() * 800);
          const y = 100 + Math.floor(Math.random() * 2000);
          console.log(chalk.gray(`  🎯 随机点击 (${x}, ${y})`));
          await tap(x, y);
          break;
        }
        case 1:
          console.log(chalk.gray('  ⬆️ 向上滑动'));
          await swipe(540, 1500, 540, 800, 300);
          break;
        case 2:
          console.log(chalk.gray('  ⬇️ 向下滑动'));
          await swipe(540, 800, 540, 1500, 300);
          break;
        case 3:
          console.log(chalk.gray('  ◀️ 返回'));
          await key(4);
          break;
        case 4:
          // 随机点击底部导航
          const navX = [200, 400, 540, 700, 900][Math.floor(Math.random() * 5)];
          console.log(chalk.gray(`  🧭 导航点击`));
          await tap(navX, 2320);
          break;
      }

      await sleep(800);

      if (i % 10 === 0) {
        await screenshot(`monkey-${i}`);
      }
    } catch {
      // 继续
    }
  }

  results.actions.push({ type: 'monkey', count, time: new Date().toISOString() });
}

/**
 * 探索所有可点击元素
 */
async function exploreClickableElements(): Promise<void> {
  console.log(chalk.cyan('\n🔍 探索可点击元素'));

  const elements = await getUiElements();
  const clickables = elements.filter((e) => e.clickable && e.text);

  console.log(chalk.gray(`  发现 ${clickables.length} 个可点击元素`));

  const skipKeywords = ['返回', '关闭', 'back', 'close', '取消'];
  const visited = new Set<string>();

  for (const el of clickables.slice(0, 10)) {
    if (skipKeywords.some((k) => el.text.toLowerCase().includes(k))) {
      continue;
    }

    if (visited.has(el.text)) {
      continue;
    }
    visited.add(el.text);

    console.log(chalk.blue(`  👆 点击: ${el.text}`));
    await tap(el.x, el.y);
    await sleep(2000);
    await screenshot(`explore-${el.text.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}`);

    results.actions.push({ type: 'explore', target: el.text, time: new Date().toISOString() });

    // 返回
    await key(4);
    await sleep(1000);
  }
}

/**
 * 生成报告
 */
async function generateReport(): Promise<void> {
  results.startTime = results.startTime;
  const endTime = new Date().toISOString();

  const report = {
    ...results,
    endTime,
    summary: {
      totalPages: results.pages.length,
      totalActions: results.actions.length,
      totalScreenshots: results.screenshots.length,
      totalErrors: results.errors.length,
    },
  };

  const jsonPath = './data/reports/app-comprehensive-test.json';
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));

  // HTML 报告
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>APP 全面测试报告</title>
  <style>
    body { font-family: system-ui; padding: 20px; background: #f0f2f5; }
    .container { max-width: 1400px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; }
    h1 { color: #1a73e8; margin-bottom: 20px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
    .stat { background: #e8f0fe; padding: 20px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 32px; font-weight: bold; color: #1a73e8; }
    .stat-label { color: #5f6368; margin-top: 5px; }
    .section { margin: 30px 0; }
    .section h2 { color: #333; border-bottom: 2px solid #1a73e8; padding-bottom: 10px; }
    .screenshots { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
    .screenshot img { width: 100%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .screenshot-label { text-align: center; margin-top: 5px; color: #5f6368; font-size: 12px; }
    .actions { max-height: 300px; overflow-y: auto; }
    .action { padding: 8px 12px; background: #f8f9fa; margin: 5px 0; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📱 APP 全面自动化测试报告</h1>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">${results.pages.length}</div>
        <div class="stat-label">测试页面</div>
      </div>
      <div class="stat">
        <div class="stat-value">${results.actions.length}</div>
        <div class="stat-label">执行动作</div>
      </div>
      <div class="stat">
        <div class="stat-value">${results.screenshots.length}</div>
        <div class="stat-label">截图数量</div>
      </div>
      <div class="stat">
        <div class="stat-value">${results.errors.length}</div>
        <div class="stat-label">错误数量</div>
      </div>
    </div>

    <div class="section">
      <h2>📸 测试截图</h2>
      <div class="screenshots">
        ${results.screenshots.map((s, i) => {
          const name = path.basename(s);
          return `<div class="screenshot">
            <img src="../data/screenshots/${name}" alt="截图${i + 1}">
            <div class="screenshot-label">${name.replace(/\.png$/, '')}</div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="section">
      <h2>👆 执行动作</h2>
      <div class="actions">
        ${results.actions.map((a) => `<div class="action">✓ ${a.type}: ${a.target || a.description || ''}</div>`).join('')}
      </div>
    </div>
  </div>
</body>
</html>`;

  const htmlPath = './data/reports/app-comprehensive-test.html';
  await fs.writeFile(htmlPath, html);

  console.log(chalk.green('\n✅ 测试报告已生成:'));
  console.log(chalk.gray(`  JSON: ${jsonPath}`));
  console.log(chalk.gray(`  HTML: ${htmlPath}`));
}

/**
 * 主测试流程
 */
async function main(): Promise<void> {
  console.log(chalk.bold.blue('\n🚀 APP 全面自动化测试\n'));
  console.log(chalk.gray('━'.repeat(50)));

  try {
    // 启动应用
    console.log(chalk.cyan('\n📱 启动应用'));
    await adb(`shell am start -n ${APP_PACKAGE}/${APP_ACTIVITY}`);
    await sleep(3000);
    await screenshot('启动页');

    // 1. 测试底部导航
    await testMainNavigation();

    // 2. 测试行情页面
    await testMarket();

    // 3. 测试交易功能
    await testTransaction();

    // 4. 测试资产页面
    await testAssets();

    // 5. 测试登录功能
    await testLogin();

    // 6. 探索可点击元素
    await exploreClickableElements();

    // 7. Monkey 测试
    await monkeyTest(20);

    console.log(chalk.gray('\n━'.repeat(50)));
    console.log(chalk.bold.green('\n✅ 测试完成!\n'));
    console.log(chalk.white(`📄 页面数: ${results.pages.length}`));
    console.log(chalk.white(`👆 动作数: ${results.actions.length}`));
    console.log(chalk.white(`📸 截图数: ${results.screenshots.length}`));

    await generateReport();
  } catch (error: any) {
    console.log(chalk.red(`\n❌ 错误: ${error.message}`));
    results.errors.push({ error: error.message });
    await generateReport();
  }
}

main();
/**
 * Slickorps APP 智能探索测试
 * 自动测试所有页面和功能按钮
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execAsync = promisify(exec);

const ADB = 'C:\\Users\\Huayao002\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const DEVICE = 'emulator-5554';
const PACKAGE = 'com.get.rich';

// 测试发现记录
const discovered = {
  pages: [] as any[],
  buttons: [] as any[],
  features: [] as any[],
  inputs: [] as any[],
  screenshots: [] as string[],
};

/**
 * 执行ADB命令
 */
async function adb(cmd: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`"${ADB}" -s ${DEVICE} ${cmd}`, { timeout: 30000 });
    return stdout;
  } catch (e: any) {
    return e.stdout || e.message;
  }
}

/**
 * 截图
 */
async function capture(name: string): Promise<void> {
  const dir = './data/screenshots/slickorps';
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);

  try {
    await adb(`shell screencap -p /sdcard/s.png`);
    await execAsync(`"${ADB}" -s ${DEVICE} pull /sdcard/s.png "${file}"`);
    discovered.screenshots.push(file);
    console.log(`  📸 ${name}`);
  } catch (e) {
    console.log(`  ❌ 截图失败: ${name}`);
  }
}

/**
 * 点击
 */
async function tap(x: number, y: number, delay: number = 1500): Promise<void> {
  await adb(`shell input tap ${x} ${y}`);
  await sleep(delay);
}

/**
 * 返回
 */
async function back(): Promise<void> {
  await adb(`shell input keyevent 4`);
  await sleep(800);
}

/**
 * 等待
 */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 获取UI元素
 */
async function getUiDump(): Promise<string> {
  try {
    await adb(`shell uiautomator dump`);
    const { stdout } = await execAsync(`"${ADB}" -s ${DEVICE} shell cat /sdcard/window_dump.xml`);
    return stdout;
  } catch {
    return '';
  }
}

/**
 * 解析元素
 */
function parseElements(xml: string): any[] {
  const elements: any[] = [];
  const regex = /<node[^>]*text="([^"]*)"[^>]*content-desc="([^"]*)"[^>]*clickable="([^"]*)"[^>]*bounds="\[(\d+,\d+)\]\[(\d+,\d+)\]"[^>]*\/>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const [x1, y1] = match[4].split(',').map(Number);
    const [x2, y2] = match[5].split(',').map(Number);
    elements.push({
      text: match[1] || '',
      contentDesc: match[2] || '',
      clickable: match[3] === 'true',
      x: Math.floor((x1 + x2) / 2),
      y: Math.floor((y1 + y2) / 2),
      width: x2 - x1,
      height: y2 - y1,
    });
  }
  return elements;
}

/**
 * 探索页面
 */
async function explorePage(pageName: string, depth: number = 0): Promise<void> {
  const indent = '  '.repeat(depth);
  console.log(`\n${indent}📄 ${pageName}`);
  await capture(pageName.replace(/\//g, '-'));

  const xml = await getUiDump();
  const elements = parseElements(xml);
  const clickables = elements.filter((e) => e.clickable && e.width > 50 && e.height > 30);
  const texts = elements.filter((e) => e.text && e.text.length > 0);

  console.log(`${indent}  元素: ${elements.length}, 可点击: ${clickables.length}`);

  // 记录页面
  discovered.pages.push({
    name: pageName,
    elementCount: elements.length,
    clickables: clickables.length,
  });

  // 记录按钮
  for (const btn of clickables) {
    const label = btn.text || btn.contentDesc || '按钮';
    if (!discovered.buttons.find((b) => b.label === label && b.page === pageName)) {
      discovered.buttons.push({
        page: pageName,
        label,
        x: btn.x,
        y: btn.y,
      });
    }
  }

  // 记录文本/功能
  for (const t of texts) {
    if (t.text.length < 50 && !discovered.features.find((f) => f.text === t.text && f.page === pageName)) {
      discovered.features.push({
        page: pageName,
        text: t.text,
        type: t.clickable ? 'button' : 'label',
      });
    }
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('🚀 Slickorps APP 智能探索测试\n');
  console.log('━'.repeat(50));

  // 启动APP
  console.log('\n📱 启动APP');
  await adb(`shell am start -n ${PACKAGE}/com.get.rich.ui.SplashActivity`);
  await sleep(5000);

  // 探索首页
  await explorePage('首页/Home');

  // 测试顶部功能按钮
  console.log('\n🔍 测试顶部功能');

  // Messages按钮
  console.log('  👆 点击 Messages');
  await tap(881, 220);
  await explorePage('Messages-消息');

  // 返回首页
  await back();
  await sleep(1000);

  // Customer Service按钮
  console.log('  👆 点击 Customer Service');
  await tap(976, 220);
  await explorePage('CustomerService-客服');

  // 返回首页
  await back();
  await sleep(1000);

  // 测试底部导航
  console.log('\n🧭 测试底部导航');

  // Trading
  console.log('  👆 点击 Trading');
  await tap(395, 2228);
  await explorePage('Trading-交易');

  // Position
  console.log('  👆 点击 Position');
  await tap(667, 2228);
  await explorePage('Position-持仓');

  // Assets
  console.log('  👆 点击 Assets');
  await tap(932, 2228);
  await explorePage('Assets-资产');

  // 返回首页
  console.log('  👆 返回 Home');
  await tap(142, 2228);
  await sleep(1000);

  // 测试股票排行
  console.log('\n📈 测试股票排行');

  // Top Losers
  console.log('  👆 点击 Top Losers');
  await tap(436, 902);
  await explorePage('TopLosers-跌幅榜');

  // 返回首页
  await back();
  await sleep(1000);

  // View More
  console.log('  👆 点击 View More');
  await tap(537, 1894);
  await explorePage('ViewMore-更多股票');

  // 返回首页
  await back();
  await sleep(1000);

  // 测试搜索
  console.log('\n🔍 测试搜索');
  await tap(487, 219);
  await sleep(1000);
  await capture('Search-搜索框');

  // 输入搜索内容
  await adb(`shell input text "Apple"`);
  await sleep(2000);
  await capture('Search-搜索结果');

  // 返回首页
  await back();
  await back();
  await sleep(1000);

  // 测试Login按钮
  console.log('\n🔐 测试登录入口');
  await tap(949, 2054);
  await explorePage('Login-登录页');

  // 输出结果
  console.log('\n' + '━'.repeat(50));
  console.log('\n✅ 探索完成!\n');

  console.log('📊 发现统计:');
  console.log(`  📄 页面: ${discovered.pages.length}`);
  console.log(`  🔘 按钮: ${discovered.buttons.length}`);
  console.log(`  ✨ 功能文本: ${discovered.features.length}`);
  console.log(`  📸 截图: ${discovered.screenshots.length}`);

  // 保存报告
  const report = {
    timestamp: new Date().toISOString(),
    appType: '金融交易APP',
    summary: {
      pages: discovered.pages.length,
      buttons: discovered.buttons.length,
      features: discovered.features.length,
      screenshots: discovered.screenshots.length,
    },
    details: discovered,
  };

  const reportPath = './data/reports/slickorps-explore-report.json';
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📝 报告: ${reportPath}`);
}

main().catch(console.error);
/**
 * 智能探索测试 v3 - 基于实际UI结构
 * 发现这是一个消息/聊天类APP
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execAsync = promisify(exec);

const ADB = '"C:\\Users\\Huayao002\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe"';
const DEVICE = 'emulator-5554';
const PACKAGE = 'com.get.rich';

// 发现记录
const discovered = {
  pages: [] as any[],
  features: [] as any[],
  buttons: [] as any[],
  inputs: [] as any[],
  elements: [] as any[],
  screenshots: [] as string[],
};

async function adb(cmd: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`${ADB} -s ${DEVICE} ${cmd}`, { timeout: 30000 });
    return stdout;
  } catch (e: any) {
    return e.stdout || e.message;
  }
}

async function capture(name: string): Promise<string> {
  const dir = './data/screenshots/final-explore';
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  try {
    await adb(`shell screencap -p /sdcard/s.png`);
    await execAsync(`${ADB} -s ${DEVICE} pull /sdcard/s.png "${file}"`);
    discovered.screenshots.push(file);
    console.log(`  📸 ${name}`);
    return file;
  } catch {
    return '';
  }
}

async function tap(x: number, y: number): Promise<void> {
  await adb(`shell input tap ${x} ${y}`);
  await new Promise((r) => setTimeout(r, 1500));
}

async function back(): Promise<void> {
  await adb(`shell input keyevent 4`);
  await new Promise((r) => setTimeout(r, 800));
}

async function getUiDump(): Promise<string> {
  try {
    await adb(`shell uiautomator dump`);
    const { stdout } = await execAsync(`${ADB} -s ${DEVICE} shell cat /sdcard/window_dump.xml`);
    return stdout;
  } catch {
    return '';
  }
}

function parseElements(xml: string): any[] {
  const elements: any[] = [];
  const regex = /<node[^>]*text="([^"]*)"[^>]*resource-id="([^"]*)"[^>]*class="([^"]*)"[^>]*clickable="([^"]*)"[^>]*bounds="\[(\d+,\d+)\]\[(\d+,\d+)\]"[^>]*\/>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const [x1, y1] = match[5].split(',').map(Number);
    const [x2, y2] = match[6].split(',').map(Number);
    elements.push({
      text: match[1] || '',
      resourceId: match[2] || '',
      className: match[3] || '',
      clickable: match[4] === 'true',
      x: Math.floor((x1 + x2) / 2),
      y: Math.floor((y1 + y2) / 2),
      width: x2 - x1,
      height: y2 - y1,
    });
  }
  return elements;
}

async function explorePage(pageName: string): Promise<void> {
  console.log(`\n📄 ${pageName}`);
  await capture(pageName);

  const xml = await getUiDump();
  const elements = parseElements(xml);

  // 提取关键信息
  const titleEl = elements.find((e) => e.resourceId.includes('page_title'));
  const searchEl = elements.find((e) => e.resourceId.includes('search'));
  const tabs = elements.filter((e) => e.resourceId.includes('tab_title'));
  const buttons = elements.filter((e) => e.clickable && e.width > 50 && e.height > 30);

  console.log(`  标题: ${titleEl?.text || '未知'}`);
  console.log(`  元素数: ${elements.length}, 可点击: ${buttons.length}`);

  // 记录页面
  discovered.pages.push({
    name: pageName,
    title: titleEl?.text,
    elementCount: elements.length,
  });

  // 记录功能
  for (const tab of tabs) {
    if (tab.text && !discovered.features.find((f) => f.text === tab.text)) {
      discovered.features.push({ page: pageName, text: tab.text, type: 'tab' });
    }
  }

  // 记录按钮
  for (const btn of buttons) {
    if (btn.text || btn.resourceId) {
      discovered.buttons.push({
        page: pageName,
        text: btn.text,
        resourceId: btn.resourceId,
        x: btn.x,
        y: btn.y,
      });
    }
  }

  // 记录元素ID（用于知识库）
  const resourceIds = elements.filter((e) => e.resourceId).map((e) => e.resourceId);
  for (const id of resourceIds) {
    if (!discovered.elements.includes(id)) {
      discovered.elements.push(id);
    }
  }

  // 尝试点击搜索
  if (searchEl) {
    console.log(`  👆 点击搜索`);
    await tap(searchEl.x, searchEl.y);
    await capture(`${pageName}-搜索`);
    await back();
  }

  // 滑动探索
  console.log(`  ⬆️ 滑动查看更多`);
  await adb(`shell input swipe 540 1800 540 800 400`);
  await new Promise((r) => setTimeout(r, 800));
  await capture(`${pageName}-滑动后`);

  // 滑回
  await adb(`shell input swipe 540 800 540 1800 400`);
  await new Promise((r) => setTimeout(r, 500));
}

async function main(): Promise<void> {
  console.log('🚀 智能探索测试 v3\n');
  console.log('━'.repeat(50));

  // 启动APP
  console.log('\n📱 启动APP');
  await adb(`shell am start -n ${PACKAGE}/com.lkandzs.imtx.app.activity.ImMainActivity`);
  await new Promise((r) => setTimeout(r, 4000));
  await capture('启动页');

  // 获取初始UI
  const xml = await getUiDump();
  const elements = parseElements(xml);

  // 发现底部导航
  const navItems = elements.filter((e) => e.resourceId.includes('tab_text'));
  console.log(`\n🧭 发现底部导航: ${navItems.map((e) => e.text).join(', ')}`);

  // 记录导航结构
  for (const nav of navItems) {
    discovered.buttons.push({
      page: '底部导航',
      text: nav.text,
      resourceId: nav.resourceId,
      x: nav.x,
      y: nav.y,
    });
  }

  // 探索每个导航页面
  for (const nav of navItems) {
    console.log(`\n📍 导航到: ${nav.text}`);
    await tap(nav.x, nav.y);
    await explorePage(nav.text);
  }

  // 输出结果
  console.log('\n' + '━'.repeat(50));
  console.log('\n✅ 探索完成!\n');

  console.log('📊 发现统计:');
  console.log(`  📄 页面: ${discovered.pages.length}`);
  console.log(`  🔘 按钮: ${discovered.buttons.length}`);
  console.log(`  ✨ 功能: ${discovered.features.length}`);
  console.log(`  🆔 元素ID: ${discovered.elements.length}`);

  // 保存报告
  const report = {
    timestamp: new Date().toISOString(),
    appType: '消息/聊天类APP',
    summary: {
      pages: discovered.pages.length,
      buttons: discovered.buttons.length,
      features: discovered.features.length,
      elements: discovered.elements.length,
    },
    details: discovered,
  };

  const reportPath = './data/reports/final-explore-report.json';
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📝 报告: ${reportPath}`);
}

main();
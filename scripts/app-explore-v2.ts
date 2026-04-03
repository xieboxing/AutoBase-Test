/**
 * 智能探索测试 v2 - 确保APP保持前台
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execAsync = promisify(exec);

const ADB = '"C:\\Users\\Huayao002\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe"';
const DEVICE = 'emulator-5554';
const PACKAGE = 'com.get.rich';
const ACTIVITY = 'com.lkandzs.imtx.app.activity.ImMainActivity';

// 发现记录
const discovered = {
  pages: [] as any[],
  features: [] as any[],
  buttons: [] as any[],
  inputs: [] as any[],
  screenshots: [] as string[],
};

/**
 * ADB 命令
 */
async function adb(cmd: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`${ADB} -s ${DEVICE} ${cmd}`, { timeout: 30000 });
    return stdout;
  } catch (e: any) {
    return e.stdout || e.message;
  }
}

/**
 * 确保APP在前台
 */
async function ensureAppForeground(): Promise<void> {
  const output = await adb(`shell dumpsys activity activities | grep mResumedActivity`);
  if (!output.includes(PACKAGE)) {
    console.log('  🔄 恢复APP到前台');
    await adb(`shell am start -n ${PACKAGE}/${ACTIVITY}`);
    await sleep(2000);
  }
}

/**
 * 截图
 */
async function capture(name: string): Promise<string> {
  const dir = './data/screenshots/explore2';
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  try {
    await adb(`shell screencap -p /sdcard/s.png`);
    await execAsync(`${ADB} -s ${DEVICE} pull /sdcard/s.png "${file}"`);
    await adb(`shell rm /sdcard/s.png`);
    discovered.screenshots.push(file);
    console.log(`  📸 ${name}`);
    return file;
  } catch {
    return '';
  }
}

/**
 * 点击
 */
async function tap(x: number, y: number): Promise<boolean> {
  await adb(`shell input tap ${x} ${y}`);
  await sleep(1200);

  // 检查APP是否还在前台
  const output = await adb(`shell dumpsys activity activities | grep mResumedActivity`);
  if (!output.includes(PACKAGE)) {
    // APP被退出，重新启动
    await ensureAppForeground();
    return false;
  }
  return true;
}

/**
 * 返回
 */
async function back(): Promise<void> {
  await adb(`shell input keyevent 4`);
  await sleep(800);
  await ensureAppForeground();
}

/**
 * 等待
 */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 获取当前页面的所有元素
 */
async function getPageElements(): Promise<any[]> {
  try {
    await adb(`shell uiautomator dump /sdcard/ui.xml`);
    const xml = await adb(`shell cat /sdcard/ui.xml`);
    const elements: any[] = [];

    // 解析所有节点
    const regex = /<node[^>]*text="([^"]*)"[^>]*resource-id="([^"]*)"[^>]*class="([^"]*)"[^>]*clickable="([^"]*)"[^>]*bounds="\[(\d+,\d+)\]\[(\d+,\d+)\]"[^>]*\/>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      const text = match[1] || '';
      const resourceId = match[2] || '';
      const className = match[3] || '';
      const clickable = match[4] === 'true';
      const [x1, y1] = match[5].split(',').map(Number);
      const [x2, y2] = match[6].split(',').map(Number);

      // 过滤掉系统UI
      if (resourceId.includes('nexuslauncher') || resourceId.includes('android:id/')) continue;
      if (y1 < 100) continue; // 顶部状态栏
      if (y2 > 2400) continue; // 超出屏幕

      elements.push({
        text,
        resourceId,
        className,
        clickable,
        x: Math.floor((x1 + x2) / 2),
        y: Math.floor((y1 + y2) / 2),
        width: x2 - x1,
        height: y2 - y1,
      });
    }

    return elements;
  } catch {
    return [];
  }
}

/**
 * 探索单个页面
 */
async function explorePage(pageName: string): Promise<void> {
  console.log(`\n📄 探索: ${pageName}`);
  await ensureAppForeground();
  await capture(`${pageName}-主界面`);

  const elements = await getPageElements();
  console.log(`  发现 ${elements.length} 个元素`);

  const clickables = elements.filter((e) => e.clickable && e.width > 50 && e.height > 30);
  const inputs = elements.filter((e) => e.className.includes('Edit') || e.resourceId.toLowerCase().includes('edit'));

  console.log(`  可点击: ${clickables.length}, 输入框: ${inputs.length}`);

  // 记录页面
  discovered.pages.push({
    name: pageName,
    elementCount: elements.length,
    clickables: clickables.length,
    inputs: inputs.length,
  });

  // 记录按钮
  for (const btn of clickables) {
    if (!discovered.buttons.find((b) => b.text === btn.text && b.page === pageName)) {
      discovered.buttons.push({
        page: pageName,
        text: btn.text,
        resourceId: btn.resourceId,
        x: btn.x,
        y: btn.y,
      });
    }
  }

  // 记录输入框
  for (const input of inputs) {
    if (!discovered.inputs.find((i) => i.resourceId === input.resourceId)) {
      discovered.inputs.push({
        page: pageName,
        resourceId: input.resourceId,
        text: input.text,
      });
    }
  }

  // 记录文本标签
  const labels = elements.filter((e) => e.text && e.text.length > 0 && e.text.length < 20);
  for (const label of labels) {
    if (!discovered.features.find((f) => f.text === label.text && f.page === pageName)) {
      discovered.features.push({
        page: pageName,
        text: label.text,
        type: 'label',
      });
    }
  }

  // 点击探索（保守策略）
  const skipKeywords = ['返回', '关闭', 'back', 'close', '取消'];
  let clickCount = 0;

  for (const el of clickables) {
    if (clickCount >= 3) break;

    const text = (el.text + el.resourceId).toLowerCase();
    if (skipKeywords.some((k) => text.includes(k))) continue;

    console.log(`  👆 点击: ${el.text || el.resourceId || '按钮'}`);
    const success = await tap(el.x, el.y);

    if (success) {
      clickCount++;
      await capture(`${pageName}-点击${el.text || '按钮'}`);

      // 检查是否有新内容
      const newElements = await getPageElements();
      if (newElements.length !== elements.length) {
        console.log(`  ✨ 发现新内容 (${newElements.length} 元素)`);

        // 记录新发现的元素
        for (const newEl of newElements) {
          if (!elements.find((e) => e.resourceId === newEl.resourceId && e.text === newEl.text)) {
            if (newEl.clickable) {
              discovered.buttons.push({
                page: pageName + '-点击后',
                text: newEl.text,
                resourceId: newEl.resourceId,
                x: newEl.x,
                y: newEl.y,
              });
            }
          }
        }
      }

      // 返回
      await back();
    }
  }
}

/**
 * 滑动探索
 */
async function swipeExplore(pageName: string): Promise<void> {
  console.log(`\n⬆️ 滑动探索: ${pageName}`);

  // 向上滑动
  await adb(`shell input swipe 540 1800 540 800 400`);
  await sleep(1000);
  await capture(`${pageName}-上滑后`);

  const elements = await getPageElements();
  console.log(`  滑动后发现 ${elements.length} 个元素`);

  // 记录新发现
  const clickables = elements.filter((e) => e.clickable && e.width > 50 && e.height > 30);
  for (const btn of clickables) {
    if (!discovered.buttons.find((b) => b.text === btn.text && b.page === pageName)) {
      discovered.buttons.push({
        page: pageName + '(滑动)',
        text: btn.text,
        resourceId: btn.resourceId,
        x: btn.x,
        y: btn.y,
      });
    }
  }

  // 向下滑动恢复
  await adb(`shell input swipe 540 800 540 1800 400`);
  await sleep(800);
}

/**
 * 生成报告并更新文档
 */
async function generateReport(): Promise<void> {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      pagesExplored: discovered.pages.length,
      buttonsFound: discovered.buttons.length,
      inputsFound: discovered.inputs.length,
      featuresFound: discovered.features.length,
      screenshots: discovered.screenshots.length,
    },
    details: discovered,
  };

  // 保存JSON
  const jsonPath = './data/reports/smart-explore-report.json';
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));

  console.log('\n📝 报告已保存: ' + jsonPath);
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('🚀 智能探索测试 v2\n');
  console.log('━'.repeat(50));

  try {
    // 启动APP
    console.log('\n📱 启动APP');
    await adb(`shell am start -n ${PACKAGE}/${ACTIVITY}`);
    await sleep(3000);
    await capture('APP启动页');

    // 底部导航
    const navItems = [
      { name: '首页', x: 200, y: 2320 },
      { name: '行情', x: 400, y: 2320 },
      { name: '交易', x: 540, y: 2320 },
      { name: '资产', x: 700, y: 2320 },
      { name: '我的', x: 900, y: 2320 },
    ];

    for (const nav of navItems) {
      console.log(`\n📍 导航到: ${nav.name}`);
      await ensureAppForeground();
      await tap(nav.x, nav.y);
      await sleep(1500);

      // 探索这个页面
      await explorePage(nav.name);

      // 滑动探索
      await swipeExplore(nav.name);
    }

    console.log('\n' + '━'.repeat(50));
    console.log('\n✅ 探索完成!\n');

    console.log('📊 发现统计:');
    console.log(`  📄 页面: ${discovered.pages.length}`);
    console.log(`  🔘 按钮: ${discovered.buttons.length}`);
    console.log(`  📝 输入框: ${discovered.inputs.length}`);
    console.log(`  ✨ 功能文本: ${discovered.features.length}`);

    await generateReport();
  } catch (e: any) {
    console.error(`\n❌ 错误: ${e.message}`);
  }
}

main();
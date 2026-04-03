/**
 * 智能全面探索测试 - 新手视角
 * 测试每个页面、每个按钮、每个功能
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

// 发现的功能和元素
const discovered = {
  pages: [] as any[],
  features: [] as any[],
  buttons: [] as any[],
  inputs: [] as any[],
  issues: [] as any[],
  screenshots: [] as string[],
};

// 已点击的元素
const clickedElements = new Set<string>();

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
 * 截图
 */
async function capture(name: string): Promise<string> {
  const dir = './data/screenshots/explore';
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}-${Date.now()}.png`);
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
async function tap(x: number, y: number): Promise<void> {
  await adb(`shell input tap ${x} ${y}`);
  await sleep(800);
}

/**
 * 输入
 */
async function typeText(text: string): Promise<void> {
  const escaped = text.replace(/ /g, '%s');
  await adb(`shell input text "${escaped}"`);
  await sleep(300);
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
async function getElements(): Promise<any[]> {
  try {
    await adb(`shell uiautomator dump /sdcard/ui.xml`);
    const xml = await adb(`shell cat /sdcard/ui.xml`);
    const elements: any[] = [];

    // 解析所有节点
    const nodeRegex = /<node[^>]*text="([^"]*)"[^>]*resource-id="([^"]*)"[^>]*class="([^"]*)"[^>]*clickable="([^"]*)"[^>]*enabled="([^"]*)"[^>]*bounds="\[(\d+,\d+)\]\[(\d+,\d+)\]"[^>]*\/>/g;
    let match;
    while ((match = nodeRegex.exec(xml)) !== null) {
      const text = match[1] || '';
      const resourceId = match[2] || '';
      const className = match[3] || '';
      const clickable = match[4] === 'true';
      const enabled = match[5] === 'true';
      const [x1, y1] = match[6].split(',').map(Number);
      const [x2, y2] = match[7].split(',').map(Number);

      // 过滤无效元素
      if (!text && !resourceId && !clickable) continue;
      if (y1 < 50) continue; // 过滤顶部状态栏

      elements.push({
        text,
        resourceId,
        className,
        clickable,
        enabled,
        x: Math.floor((x1 + x2) / 2),
        y: Math.floor((y1 + y2) / 2),
        width: x2 - x1,
        height: y2 - y1,
        bounds: `[${match[6]}][${match[7]}]`,
      });
    }

    return elements;
  } catch {
    return [];
  }
}

/**
 * 获取当前Activity
 */
async function getActivity(): Promise<string> {
  try {
    const output = await adb(`shell dumpsys activity activities | grep mResumedActivity`);
    const match = output.match(/([a-zA-Z0-9.]+\/[a-zA-Z0-9.]+)/);
    return match ? match[1] : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * 探索页面 - 点击所有可点击元素
 */
async function explorePage(pageName: string, depth: number = 0): Promise<void> {
  const indent = '  '.repeat(depth);
  console.log(`\n${indent}📄 探索: ${pageName}`);

  const activity = await getActivity();
  console.log(`${indent}  Activity: ${activity}`);

  // 截图
  await capture(`${pageName.replace(/\s+/g, '-')}-主页面`);

  // 获取元素
  const elements = await getElements();
  console.log(`${indent}  发现 ${elements.length} 个元素`);

  // 分类元素
  const clickables = elements.filter((e) => e.clickable && e.enabled);
  const inputs = elements.filter((e) => e.className.includes('Edit') || e.resourceId.toLowerCase().includes('input'));
  const texts = elements.filter((e) => e.text && e.text.length > 0);

  // 记录页面信息
  discovered.pages.push({
    name: pageName,
    activity,
    elementCount: elements.length,
    clickables: clickables.length,
    inputs: inputs.length,
  });

  // 记录发现的按钮
  for (const el of clickables) {
    const key = el.text || el.resourceId || el.bounds;
    if (!discovered.buttons.find((b) => (b.text || b.resourceId) === key)) {
      discovered.buttons.push({
        page: pageName,
        text: el.text,
        resourceId: el.resourceId,
        x: el.x,
        y: el.y,
        className: el.className,
      });
    }
  }

  // 记录发现的输入框
  for (const el of inputs) {
    if (!discovered.inputs.find((i) => i.resourceId === el.resourceId)) {
      discovered.inputs.push({
        page: pageName,
        text: el.text,
        resourceId: el.resourceId,
        placeholder: el.text,
      });
    }
  }

  // 记录发现的文本/功能
  for (const el of texts) {
    if (el.text.length > 0 && el.text.length < 20) {
      if (!discovered.features.find((f) => f.text === el.text && f.page === pageName)) {
        discovered.features.push({
          page: pageName,
          text: el.text,
          type: el.clickable ? 'button' : 'label',
        });
      }
    }
  }

  // 点击探索（排除返回和关闭）
  if (depth < 2) {
    const skipKeywords = ['返回', '关闭', 'back', 'close', '取消', 'cancel', '返回'];
    const toClick = clickables.filter((el) => {
      const text = (el.text + el.resourceId).toLowerCase();
      return !skipKeywords.some((k) => text.includes(k));
    });

    let clickCount = 0;
    for (const el of toClick) {
      if (clickCount >= 8) break; // 每页最多点击8个

      const key = el.text || el.resourceId || el.bounds;
      if (clickedElements.has(key)) continue;
      clickedElements.add(key);

      console.log(`${indent}  👆 点击: ${el.text || el.resourceId || el.className}`);
      await tap(el.x, el.y);
      await sleep(1500);

      // 检查是否进入了新页面
      const newActivity = await getActivity();
      if (newActivity !== activity) {
        // 新页面，截图并探索
        await capture(`${pageName.replace(/\s+/g, '-')}-点击${el.text || '元素'}后`);

        // 记录功能跳转
        discovered.features.push({
          page: pageName,
          text: el.text,
          type: 'navigation',
          target: newActivity,
        });

        // 返回
        await back();
        await sleep(1000);
      }

      clickCount++;
    }
  }
}

/**
 * 探索底部导航
 */
async function exploreNavigation(): Promise<void> {
  console.log('\n🧭 探索底部导航');

  const navItems = [
    { name: '首页', x: 200, y: 2320 },
    { name: '行情', x: 400, y: 2320 },
    { name: '交易', x: 540, y: 2320 },
    { name: '资产', x: 700, y: 2320 },
    { name: '我的', x: 900, y: 2320 },
  ];

  for (const nav of navItems) {
    console.log(`\n📍 进入: ${nav.name}`);
    await tap(nav.x, nav.y);
    await sleep(1500);

    // 探索这个页面
    await explorePage(nav.name, 0);

    // 尝试上滑查看更多内容
    console.log(`  ⬆️ 上滑查看更多`);
    await adb(`shell input swipe 540 1800 540 800 300`);
    await sleep(800);
    await capture(`${nav.name}-滑动后`);

    // 再探索一次看有没有新元素
    const elements = await getElements();
    const newClickables = elements.filter((e) => e.clickable && e.enabled);
    console.log(`  滑动后发现 ${newClickables.length} 个元素`);

    // 记录滑动后发现的按钮
    for (const el of newClickables) {
      const key = el.text || el.resourceId || el.bounds;
      if (!discovered.buttons.find((b) => (b.text || b.resourceId) === key)) {
        discovered.buttons.push({
          page: nav.name + '(滑动后)',
          text: el.text,
          resourceId: el.resourceId,
          x: el.x,
          y: el.y,
          className: el.className,
        });
      }
    }
  }
}

/**
 * 测试登录流程
 */
async function testLogin(): Promise<void> {
  console.log('\n🔐 探索登录功能');

  // 进入我的页面
  await tap(900, 2320);
  await sleep(1500);
  await capture('登录-我的页面');

  // 获取元素
  let elements = await getElements();

  // 查找登录相关按钮
  const loginBtn = elements.find(
    (e) =>
      e.text.includes('登录') ||
      e.text.includes('Login') ||
      e.text.includes('点击登录') ||
      e.resourceId.toLowerCase().includes('login'),
  );

  if (loginBtn) {
    console.log(`  👆 点击登录入口: ${loginBtn.text}`);
    await tap(loginBtn.x, loginBtn.y);
    await sleep(2000);
    await capture('登录-登录页面');

    // 获取登录页面元素
    elements = await getElements();

    // 查找输入框
    const inputs = elements.filter((e) => e.className.includes('Edit') || e.resourceId.includes('input') || e.resourceId.includes('phone') || e.resourceId.includes('password'));

    console.log(`  发现 ${inputs.length} 个输入框`);
    for (const input of inputs) {
      discovered.inputs.push({
        page: '登录页面',
        resourceId: input.resourceId,
        text: input.text,
      });
    }

    // 查找其他登录方式
    const otherLogins = elements.filter(
      (e) =>
        e.text.includes('微信') ||
        e.text.includes('QQ') ||
        e.text.includes('Google') ||
        e.text.includes('验证码') ||
        e.text.includes('注册'),
    );

    console.log(`  发现其他登录方式: ${otherLogins.map((e) => e.text).join(', ')}`);
    for (const ol of otherLogins) {
      discovered.features.push({
        page: '登录页面',
        text: ol.text,
        type: 'auth-option',
      });
    }

    // 查找登录按钮
    const submitBtn = elements.find(
      (e) =>
        (e.text.includes('登录') || e.text.includes('确定') || e.text.includes('Login')) &&
        e.clickable,
    );

    if (submitBtn) {
      discovered.buttons.push({
        page: '登录页面',
        text: submitBtn.text,
        resourceId: submitBtn.resourceId,
        x: submitBtn.x,
        y: submitBtn.y,
      });
    }

    await back();
    await sleep(1000);
  }
}

/**
 * 生成测试发现报告
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

  // JSON报告
  const jsonPath = './data/reports/explore-report.json';
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));

  // 生成Markdown报告
  const md = `# Slickorps APP 探索测试报告

> 测试时间: ${report.timestamp}

## 📊 测试概览

| 项目 | 数量 |
|------|------|
| 探索页面 | ${discovered.pages.length} |
| 发现按钮 | ${discovered.buttons.length} |
| 发现输入框 | ${discovered.inputs.length} |
| 发现功能 | ${discovered.features.length} |
| 截图数量 | ${discovered.screenshots.length} |

## 📄 页面列表

${discovered.pages.map((p) => `- **${p.name}** (${p.elementCount} 元素, ${p.clickables} 可点击)`).join('\n')}

## 🔘 发现的按钮

| 页面 | 文本 | Resource-ID |
|------|------|-------------|
${discovered.buttons.map((b) => `| ${b.page} | ${b.text || '-'} | ${b.resourceId || '-'} |`).join('\n')}

## 📝 发现的输入框

| 页面 | Resource-ID | 提示文本 |
|------|-------------|----------|
${discovered.inputs.map((i) => `| ${i.page} | ${i.resourceId || '-'} | ${i.text || '-'} |`).join('\n')}

## ✨ 发现的功能

| 页面 | 内容 | 类型 |
|------|------|------|
${discovered.features.map((f) => `| ${f.page} | ${f.text} | ${f.type} |`).join('\n')}

## 📸 截图列表

${discovered.screenshots.map((s) => `- ${path.basename(s)}`).join('\n')}

---
*此报告由智能测试系统自动生成*
`;

  const mdPath = './data/reports/explore-report.md';
  await fs.writeFile(mdPath, md);

  console.log('\n📝 报告已生成:');
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  Markdown: ${mdPath}`);
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('🚀 开始智能探索测试\n');
  console.log('━'.repeat(50));

  try {
    // 启动应用
    console.log('\n📱 启动应用');
    await adb(`shell am start -n ${PACKAGE}/${ACTIVITY}`);
    await sleep(3000);
    await capture('启动页');

    // 探索底部导航的每个页面
    await exploreNavigation();

    // 测试登录
    await testLogin();

    console.log('\n━'.repeat(50));
    console.log('\n✅ 探索测试完成!\n');

    // 输出统计
    console.log('📊 发现统计:');
    console.log(`  📄 页面: ${discovered.pages.length}`);
    console.log(`  🔘 按钮: ${discovered.buttons.length}`);
    console.log(`  📝 输入框: ${discovered.inputs.length}`);
    console.log(`  ✨ 功能: ${discovered.features.length}`);
    console.log(`  📸 截图: ${discovered.screenshots.length}`);

    // 生成报告
    await generateReport();
  } catch (e: any) {
    console.error(`\n❌ 错误: ${e.message}`);
  }
}

main();
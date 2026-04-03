#!/usr/bin/env tsx
/**
 * Slickorps APP 手动深度探索测试
 * 从新手角度测试每个页面和功能按钮
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ADB = 'adb';
const DEVICE = 'emulator-5554';
const PACKAGE = 'com.get.rich';
const ACTIVITY = 'com.get.rich.ui.SplashActivity';

// 测试账号
const ACCOUNT = {
  phone: '+62 82261968098',
  password: 'aA123456789'
};

// 截图目录
const SCREENSHOT_DIR = './data/screenshots/slickorps-deep-test';

// 测试记录
const testLog: Array<{
  step: string;
  action: string;
  page: string;
  elementsFound: string[];
  screenshot: string;
  notes: string;
}> = [];

function adb(cmd: string): string {
  try {
    return execSync(`${ADB} -s ${DEVICE} ${cmd}`, { encoding: 'utf-8', timeout: 30000 });
  } catch (e: any) {
    return e.stdout || e.message;
  }
}

function sleep(ms: number) {
  execSync(`sleep ${ms / 1000}`, { timeout: ms + 5000 });
}

function screenshot(name: string): string {
  const dir = path.resolve(SCREENSHOT_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, `${name}.png`);
  adb(`shell screencap -p /sdcard/s.png`);
  execSync(`${ADB} -s ${DEVICE} pull /sdcard/s.png "${file}"`);
  adb(`shell rm /sdcard/s.png`);
  return file;
}

function tap(x: number, y: number, delay = 1500) {
  console.log(`  👆 TAP (${x}, ${y})`);
  adb(`shell input tap ${x} ${y}`);
  sleep(delay);
}

function inputText(text: string) {
  // 清空并输入
  adb(`shell input keyevent KEYCODE_MOVE_END`);
  for (let i = 0; i < 30; i++) adb(`shell input keyevent KEYCODE_DEL`);

  // 处理特殊字符
  const escaped = text.replace(/ /g, '%s').replace(/\+/g, '%+');
  adb(`shell input text "${escaped}"`);
  sleep(500);
}

function back() {
  adb(`shell input keyevent KEYCODE_BACK`);
  sleep(800);
}

function getUIDump(): string {
  adb(`shell uiautomator dump`);
  return adb(`shell cat /sdcard/window_dump.xml`);
}

function parseAllElements(xml: string): Array<{
  text: string;
  contentDesc: string;
  clickable: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  className: string;
}> {
  const elements: any[] = [];
  // 更全面的正则匹配
  const regex = /<node[^>]*text="([^"]*)"[^>]*content-desc="([^"]*)"[^>]*clickable="([^"]*)"[^>]*class="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*\/>/g;

  let match;
  while ((match = regex.exec(xml)) !== null) {
    const x1 = parseInt(match[5]);
    const y1 = parseInt(match[6]);
    const x2 = parseInt(match[7]);
    const y2 = parseInt(match[8]);

    elements.push({
      text: match[1] || '',
      contentDesc: match[2] || '',
      clickable: match[3] === 'true',
      className: match[4] || '',
      x: Math.round((x1 + x2) / 2),
      y: Math.round((y1 + y2) / 2),
      width: x2 - x1,
      height: y2 - y1
    });
  }
  return elements;
}

function logTest(step: string, action: string, page: string, elements: string[], screenshot: string, notes: string) {
  testLog.push({ step, action, page, elementsFound: elements, screenshot, notes });
  console.log(`📝 [${step}] ${action} @ ${page} → ${notes}`);
}

async function runDeepTest() {
  console.log('\n🚀 ========== Slickorps APP 深度探索测试 ==========\n');
  console.log(`📅 时间: ${new Date().toISOString()}`);
  console.log(`📱 设备: ${DEVICE}`);
  console.log(`🔐 账号: ${ACCOUNT.phone}\n`);

  // ===== Step 1: 启动APP =====
  console.log('\n📍 STEP 1: 启动APP');
  adb(`shell am force-stop ${PACKAGE}`);
  sleep(1000);
  adb(`shell am start -n ${PACKAGE}/${ACTIVITY}`);
  sleep(5000);

  let ss = screenshot('01-app-launch');
  let xml = getUIDump();
  let elements = parseAllElements(xml);
  logTest('S1', '启动APP', '启动页', elements.map(e => e.text || e.contentDesc).filter(t => t), ss, `发现${elements.length}个元素`);

  // ===== Step 2: 进入登录流程 =====
  console.log('\n📍 STEP 2: 进入登录流程');

  // 查找并点击Login按钮
  const loginBtn = elements.find(e => e.text === 'Login' || e.contentDesc === 'Login');
  if (loginBtn) {
    tap(loginBtn.x, loginBtn.y);
    ss = screenshot('02-click-login');
    xml = getUIDump();
    elements = parseAllElements(xml);
    logTest('S2', '点击Login', '登录选择', elements.map(e => e.text).filter(t => t), ss, '进入登录选择页');

    // 如果还有Login按钮（弹窗中的），再点击一次
    const innerLogin = elements.find(e => e.text === 'Login' && e.x > 500);
    if (innerLogin) {
      tap(innerLogin.x, innerLogin.y);
      sleep(2000);
      ss = screenshot('03-login-form');
      xml = getUIDump();
      elements = parseAllElements(xml);
      logTest('S3', '点击弹窗Login', '登录表单', elements.map(e => e.text).filter(t => t), ss, '进入登录表单');
    }
  }

  // ===== Step 3: 输入账号密码 =====
  console.log('\n📍 STEP 3: 输入账号密码');

  // 查找输入框（通常是EditText或类似的空文本可点击区域）
  const inputs = elements.filter(e => e.width > 300 && e.height > 60);

  if (inputs.length >= 2) {
    // 输入手机号
    tap(inputs[0].x, inputs[0].y, 500);
    inputText(ACCOUNT.phone);
    ss = screenshot('04-input-phone');
    logTest('S4a', '输入手机号', '登录表单', [ACCOUNT.phone], ss, '输入完成');

    // 输入密码
    tap(inputs[1].x, inputs[1].y, 500);
    inputText(ACCOUNT.password);
    ss = screenshot('05-input-password');
    logTest('S4b', '输入密码', '登录表单', ['******'], ss, '输入完成');

    // 点击提交按钮
    const submitBtn = elements.find(e =>
      e.text.toLowerCase().includes('login') ||
      e.text.toLowerCase().includes('sign') ||
      e.text.toLowerCase().includes('submit')
    );

    if (submitBtn) {
      tap(submitBtn.x, submitBtn.y);
      sleep(5000);
      ss = screenshot('06-login-result');
      xml = getUIDump();
      elements = parseAllElements(xml);

      // 检查登录状态
      const hasUserData = elements.some(e =>
        e.text.includes('+62') ||
        e.text.includes('Balance') ||
        e.text.includes('余额') ||
        e.text.includes('$')
      );

      logTest('S5', '提交登录', '登录结果', elements.map(e => e.text).filter(t => t).slice(0, 5), ss,
        hasUserData ? '✅ 登录成功' : '❌ 登录可能失败');
    }
  }

  // ===== Step 4: 探索首页 =====
  console.log('\n📍 STEP 4: 探索首页功能');

  xml = getUIDump();
  elements = parseAllElements(xml);
  ss = screenshot('07-home-page');
  logTest('S6', '首页概览', '首页', elements.map(e => e.text || e.contentDesc).filter(t => t).slice(0, 10), ss,
    `首页元素: ${elements.length}个`);

  // 测试首页顶部功能按钮
  const topButtons = [
    { name: '菜单', x: 84, y: 218 },
    { name: '搜索', x: 487, y: 219 },
    { name: 'Messages', x: 881, y: 220 },
    { name: '客服', x: 976, y: 220 }
  ];

  for (const btn of topButtons) {
    console.log(`\n  🔍 测试: ${btn.name}`);
    tap(btn.x, btn.y);
    ss = screenshot(`08-home-${btn.name}`);
    xml = getUIDump();
    elements = parseAllElements(xml);
    logTest(`S7-${btn.name}`, `点击${btn.name}`, btn.name, elements.map(e => e.text).filter(t => t).slice(0, 5), ss,
      `${btn.name}页面元素: ${elements.length}个`);
    back();
    sleep(1000);
  }

  // 测试首页中部功能入口
  const middleButtons = [
    { name: 'Deposit', x: 138, y: 714 },
    { name: 'Invite', x: 402, y: 714 },
    { name: 'About', x: 666, y: 714 },
    { name: 'Announcement', x: 937, y: 714 }
  ];

  console.log('\n  🔍 测试中部功能入口');
  for (const btn of middleButtons) {
    console.log(`    👆 ${btn.name}`);
    tap(btn.x, btn.y);
    ss = screenshot(`09-home-${btn.name}`);
    xml = getUIDump();
    elements = parseAllElements(xml);
    logTest(`S8-${btn.name}`, `点击${btn.name}`, btn.name, elements.map(e => e.text).filter(t => t).slice(0, 5), ss,
      `${btn.name}页面`);
    back();
    sleep(1000);
  }

  // ===== Step 5: 探索底部导航 =====
  console.log('\n📍 STEP 5: 探索底部导航页面');

  const bottomNav = [
    { name: 'Home', x: 142, y: 2228 },
    { name: 'Trading', x: 395, y: 2228 },
    { name: 'Position', x: 667, y: 2228 },
    { name: 'Assets', x: 932, y: 2228 }
  ];

  for (const nav of bottomNav) {
    console.log(`\n  📄 探索 ${nav.name}`);
    tap(nav.x, nav.y);
    sleep(2000);
    ss = screenshot(`10-nav-${nav.name}`);
    xml = getUIDump();
    elements = parseAllElements(xml);

    const texts = elements.map(e => e.text || e.contentDesc).filter(t => t && t.length > 0);
    logTest(`S9-${nav.name}`, `切换${nav.name}`, nav.name, texts.slice(0, 10), ss,
      `${nav.name}页面发现${elements.length}个元素，${texts.length}个文本`);

    // 在每个页面测试一些可点击元素
    const clickables = elements.filter(e => e.clickable && e.width > 50 && e.height > 30 && e.text);
    console.log(`    可点击元素: ${clickables.length}个`);

    // 测试前3个可点击元素
    for (let i = 0; i < Math.min(3, clickables.length); i++) {
      const btn = clickables[i];
      if (btn.text && !['Home', 'Trading', 'Position', 'Assets'].includes(btn.text)) {
        console.log(`      👆 点击: ${btn.text}`);
        tap(btn.x, btn.y);
        ss = screenshot(`11-${nav.name}-${btn.text}`);
        xml = getUIDump();
        elements = parseAllElements(xml);
        logTest(`S10-${nav.name}-${btn.text}`, `点击${btn.text}`, `${nav.name}子页`,
          elements.map(e => e.text).filter(t => t).slice(0, 5), ss, `进入${btn.text}`);
        back();
        sleep(1000);
      }
    }
  }

  // ===== Step 6: Trading页面深度测试 =====
  console.log('\n📍 STEP 6: Trading交易页面深度测试');

  tap(395, 2228); // 进入Trading
  sleep(2000);
  ss = screenshot('12-trading-main');
  xml = getUIDump();
  elements = parseAllElements(xml);

  // 查找交易分类标签
  const categories = ['Forex', 'Commodities', 'Indices', 'Stocks'];
  console.log('  📊 测试交易分类');

  for (const cat of categories) {
    const catBtn = elements.find(e => e.text.includes(cat));
    if (catBtn) {
      tap(catBtn.x, catBtn.y);
      ss = screenshot(`13-trading-${cat}`);
      xml = getUIDump();
      elements = parseAllElements(xml);

      // 查找交易对
      const pairs = elements.filter(e => e.text.includes('/'));
      logTest(`S11-${cat}`, `查看${cat}`, 'Trading', pairs.map(e => e.text).slice(0, 5), ss,
        `${cat}分类发现${pairs.length}个交易对`);
    }
  }

  // 点击一个交易对进入详情
  const pairBtn = elements.find(e => e.text.includes('/') && e.clickable);
  if (pairBtn) {
    console.log(`\n  💹 点击交易对: ${pairBtn.text}`);
    tap(pairBtn.x, pairBtn.y);
    sleep(2000);
    ss = screenshot('14-trading-pair-detail');
    xml = getUIDump();
    elements = parseAllElements(xml);
    logTest('S12', '进入交易对详情', '交易详情', elements.map(e => e.text).filter(t => t).slice(0, 10), ss,
      '进入交易详情页');

    // 查找买入/卖出按钮
    const buyBtn = elements.find(e => e.text.toLowerCase().includes('buy') || e.text.includes('买入'));
    const sellBtn = elements.find(e => e.text.toLowerCase().includes('sell') || e.text.includes('卖出'));

    if (buyBtn || sellBtn) {
      const actionBtn = buyBtn || sellBtn!;
      console.log(`    👆 点击 ${actionBtn.text}`);
      tap(actionBtn.x, actionBtn.y);
      sleep(2000);
      ss = screenshot('15-trade-order');
      xml = getUIDump();
      elements = parseAllElements(xml);
      logTest('S13', '点击下单按钮', '下单页', elements.map(e => e.text).filter(t => t).slice(0, 5), ss,
        '进入下单页面');

      // 查找手数/数量输入框并输入
      const orderInputs = elements.filter(e => e.width > 150 && e.height > 40 && !e.text);
      if (orderInputs.length > 0) {
        tap(orderInputs[0].x, orderInputs[0].y);
        inputText('0.01');
        ss = screenshot('16-input-volume');
        logTest('S14', '输入交易量', '下单页', ['0.01'], ss, '输入最小手数');
      }

      // 查找确认按钮
      const confirmBtn = elements.find(e =>
        e.text.toLowerCase().includes('confirm') ||
        e.text.toLowerCase().includes('submit') ||
        e.text.toLowerCase().includes('open') ||
        e.text.includes('确认')
      );

      if (confirmBtn) {
        console.log(`    👆 点击确认下单`);
        tap(confirmBtn.x, confirmBtn.y);
        sleep(3000);
        ss = screenshot('17-order-result');
        xml = getUIDump();
        elements = parseAllElements(xml);
        logTest('S15', '确认下单', '下单结果', elements.map(e => e.text).filter(t => t).slice(0, 5), ss,
          '下单提交完成');
      }
    }

    back();
    sleep(1000);
  }

  // ===== Step 7: Position持仓页面 =====
  console.log('\n📍 STEP 7: Position持仓页面');

  tap(667, 2228);
  sleep(2000);
  ss = screenshot('18-position-page');
  xml = getUIDump();
  elements = parseAllElements(xml);

  // 查找持仓项
  const positions = elements.filter(e =>
    e.text.includes('/') ||
    e.text.includes('profit') ||
    e.text.includes('loss') ||
    e.text.includes('$')
  );
  logTest('S16', '查看持仓', 'Position', positions.map(e => e.text).slice(0, 5), ss,
    `发现${positions.length}个持仓相关元素`);

  // 如果有持仓项，尝试点击查看详情
  if (positions.length > 0) {
    const posItem = positions.find(e => e.clickable);
    if (posItem) {
      tap(posItem.x, posItem.y);
      ss = screenshot('19-position-detail');
      xml = getUIDump();
      elements = parseAllElements(xml);
      logTest('S17', '查看持仓详情', '持仓详情', elements.map(e => e.text).filter(t => t).slice(0, 5), ss,
        '进入持仓详情');

      // 查找平仓按钮
      const closeBtn = elements.find(e =>
        e.text.toLowerCase().includes('close') ||
        e.text.includes('平仓')
      );
      if (closeBtn) {
        console.log(`    👆 发现平仓按钮`);
        // 不实际点击平仓，只记录
        logTest('S18', '发现平仓功能', '持仓详情', [closeBtn.text], ss, '存在平仓按钮');
      }
      back();
      sleep(1000);
    }
  }

  // ===== Step 8: Assets资产页面 =====
  console.log('\n📍 STEP 8: Assets资产页面');

  tap(932, 2228);
  sleep(2000);
  ss = screenshot('20-assets-page');
  xml = getUIDump();
  elements = parseAllElements(xml);

  const assetInfo = elements.filter(e =>
    e.text.includes('$') ||
    e.text.includes('Balance') ||
    e.text.includes('余额') ||
    e.text.includes('Deposit') ||
    e.text.includes('Withdraw')
  );
  logTest('S19', '查看资产', 'Assets', assetInfo.map(e => e.text).slice(0, 10), ss,
    `资产页面发现${assetInfo.length}个相关信息`);

  // 测试资产页面功能按钮
  const assetButtons = elements.filter(e => e.clickable && e.text);
  for (let i = 0; i < Math.min(3, assetButtons.length); i++) {
    const btn = assetButtons[i];
    if (!['Home', 'Trading', 'Position', 'Assets'].includes(btn.text)) {
      console.log(`    👆 点击: ${btn.text}`);
      tap(btn.x, btn.y);
      ss = screenshot(`21-assets-${btn.text}`);
      xml = getUIDump();
      elements = parseAllElements(xml);
      logTest(`S20-${btn.text}`, `点击${btn.text}`, 'Assets子页',
        elements.map(e => e.text).filter(t => t).slice(0, 5), ss, `进入${btn.text}`);
      back();
      sleep(1000);
    }
  }

  // ===== Step 9: 查找历史记录 =====
  console.log('\n📍 STEP 9: 查找历史记录');

  // 回到Position页面查找历史记录入口
  tap(667, 2228);
  sleep(1500);
  xml = getUIDump();
  elements = parseAllElements(xml);

  // 查找History相关按钮/标签
  const historyBtn = elements.find(e =>
    e.text.toLowerCase().includes('history') ||
    e.text.includes('历史') ||
    e.text.includes('Record')
  );

  if (historyBtn) {
    tap(historyBtn.x, historyBtn.y);
    ss = screenshot('22-history-page');
    xml = getUIDump();
    elements = parseAllElements(xml);
    logTest('S21', '查看历史', '历史记录', elements.map(e => e.text).filter(t => t).slice(0, 10), ss,
      '进入历史记录页面');
  } else {
    // 尝试滑动查找
    adb(`shell input swipe 540 1800 540 800 300`);
    sleep(1000);
    ss = screenshot('22-swipe-for-history');
    xml = getUIDump();
    elements = parseAllElements(xml);
    logTest('S21', '滑动查找历史', 'Position', elements.map(e => e.text).filter(t => t).slice(0, 5), ss,
      '尝试滑动查找历史入口');
  }

  // ===== Step 10: 设置和个人中心 =====
  console.log('\n📍 STEP 10: 设置和个人中心');

  tap(142, 2228); // Home
  sleep(1500);
  tap(84, 218); // 菜单按钮
  sleep(2000);
  ss = screenshot('23-side-menu');
  xml = getUIDump();
  elements = parseAllElements(xml);

  const menuItems = elements.filter(e => e.text && e.text.length > 0);
  logTest('S22', '打开侧边菜单', '菜单', menuItems.map(e => e.text).slice(0, 10), ss,
    `发现${menuItems.length}个菜单项`);

  // 测试菜单项
  for (let i = 0; i < Math.min(5, menuItems.length); i++) {
    const item = menuItems[i];
    if (item.clickable && item.text) {
      console.log(`    👆 点击菜单: ${item.text}`);
      tap(item.x, item.y);
      ss = screenshot(`24-menu-${item.text}`);
      xml = getUIDump();
      elements = parseAllElements(xml);
      logTest(`S23-${item.text}`, `点击菜单${item.text}`, item.text,
        elements.map(e => e.text).filter(t => t).slice(0, 5), ss, `进入${item.text}`);
      back();
      sleep(1000);
    }
  }

  // ===== 生成测试报告 =====
  console.log('\n📊 ========== 生成测试报告 ==========\n');

  const report = {
    testTime: new Date().toISOString(),
    device: DEVICE,
    app: PACKAGE,
    account: ACCOUNT.phone,
    summary: {
      totalSteps: testLog.length,
      screenshots: fs.readdirSync(path.resolve(SCREENSHOT_DIR)).length,
      pagesExplored: new Set(testLog.map(l => l.page)).size,
      featuresFound: testLog.flatMap(l => l.elementsFound).filter(t => t && t.length > 0).length
    },
    details: testLog,
    discoveredFeatures: [
      ...testLog.map(l => `${l.page}: ${l.elementsFound.slice(0, 3).join(', ')}`)
    ].slice(0, 20)
  };

  const reportPath = './data/reports/slickorps-deep-test-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`✅ 测试报告: ${reportPath}`);
  console.log(`📸 截图目录: ${SCREENSHOT_DIR}`);
  console.log(`📝 测试步骤: ${report.summary.totalSteps}`);
  console.log(`📄 探索页面: ${report.summary.pagesExplored}`);
  console.log(`🔍 发现功能: ${report.summary.featuresFound}`);

  console.log('\n🎉 ========== 测试完成 ==========\n');
}

runDeepTest().catch(console.error);
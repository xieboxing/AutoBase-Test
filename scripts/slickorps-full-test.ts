/**
 * Slickorps APP 完整智能测试
 * 主流程：登录 → 探索全部页面 → 交易开仓 → 交易平仓 → 查看历史记录
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execAsync = promisify(exec);

const ADB = 'C:\\Users\\Huayao002\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const DEVICE = 'emulator-5554';
const PACKAGE = 'com.get.rich';

// 测试账号
const TEST_ACCOUNT = {
  phone: '+62 82261968098',
  password: 'aA123456789',
};

// 测试发现记录
const testResults = {
  login: { success: false, screenshots: [] as string[] },
  pages: [] as any[],
  features: [] as any[],
  trade: { openSuccess: false, closeSuccess: false, screenshots: [] as string[] },
  issues: [] as any[],
};

/**
 * ADB 命令
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
  const dir = './data/screenshots/slickorps-full-test';
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);

  try {
    await adb(`shell screencap -p /sdcard/s.png`);
    await execAsync(`"${ADB}" -s ${DEVICE} pull /sdcard/s.png "${file}"`);
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
 * 输入文本
 */
async function inputText(text: string): Promise<void> {
  // 清除之前的输入
  await adb(`shell input keyevent KEYCODE_MOVE_END`);
  for (let i = 0; i < 50; i++) {
    await adb(`shell input keyevent KEYCODE_DEL`);
  }
  // 输入新文本 (处理特殊字符)
  const escaped = text.replace(/ /g, '%s').replace(/\+/g, '%+');
  await adb(`shell input text "${escaped}"`);
  await sleep(500);
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
 * 获取UI dump
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
 * 查找元素
 */
function findElement(elements: any[], options: { text?: string; contentDesc?: string; partial?: boolean }): any | null {
  for (const el of elements) {
    if (options.text) {
      if (options.partial) {
        if (el.text.toLowerCase().includes(options.text.toLowerCase())) return el;
      } else {
        if (el.text === options.text) return el;
      }
    }
    if (options.contentDesc) {
      if (options.partial) {
        if (el.contentDesc.toLowerCase().includes(options.contentDesc.toLowerCase())) return el;
      } else {
        if (el.contentDesc === options.contentDesc) return el;
      }
    }
  }
  return null;
}

/**
 * 步骤1：启动APP并登录
 */
async function testLogin(): Promise<boolean> {
  console.log('\n' + '='.repeat(50));
  console.log('🔐 步骤1: 登录测试');
  console.log('='.repeat(50));

  // 启动APP
  console.log('\n📱 启动APP');
  await adb(`shell am start -n ${PACKAGE}/com.get.rich.ui.SplashActivity`);
  await sleep(5000);
  await capture('01-APP启动页');

  // 点击首页登录按钮
  console.log('\n👆 点击登录入口');
  await tap(949, 2054); // Login按钮
  await sleep(2000);
  await capture('02-登录入口点击');

  // 获取登录页面元素
  let xml = await getUiDump();
  let elements = parseElements(xml);

  // 检查是否是注册/登录选择页
  const loginBtn = findElement(elements, { text: 'Login' });
  const registerBtn = findElement(elements, { text: 'Register' });

  if (loginBtn && registerBtn) {
    console.log('  发现注册/登录选择页，点击Login');
    await tap(loginBtn.x, loginBtn.y);
    await sleep(2000);
    await capture('03-选择登录');
  }

  // 获取登录表单
  xml = await getUiDump();
  elements = parseElements(xml);
  await capture('04-登录表单');

  // 查找输入框 - 通常是EditText类型
  const inputs = elements.filter((e) => e.height > 80 && e.width > 400);

  if (inputs.length >= 2) {
    // 输入手机号
    console.log(`\n📝 输入手机号: ${TEST_ACCOUNT.phone}`);
    await tap(inputs[0].x, inputs[0].y);
    await sleep(500);
    await inputText(TEST_ACCOUNT.phone);
    await capture('05-输入手机号');

    // 输入密码
    console.log(`📝 输入密码: ${TEST_ACCOUNT.password}`);
    await tap(inputs[1].x, inputs[1].y);
    await sleep(500);
    await inputText(TEST_ACCOUNT.password);
    await capture('06-输入密码');

    // 点击登录按钮
    const submitBtn = findElement(elements, { text: 'Login', partial: true }) || findElement(elements, { text: 'Sign', partial: true });
    if (submitBtn) {
      console.log('\n👆 点击登录按钮');
      await tap(submitBtn.x, submitBtn.y);
      await sleep(5000);
      await capture('07-登录提交');
    }
  } else {
    console.log('  ⚠️ 未找到登录输入框，尝试其他方式');
    // 记录问题
    testResults.issues.push({
      page: '登录页',
      description: '未找到登录输入框',
      severity: 'high',
    });
  }

  // 验证登录成功
  xml = await getUiDump();
  elements = parseElements(xml);

  // 检查是否还有登录按钮（如果还有说明未登录成功）
  const stillHasLogin = elements.find((e) => e.text.toLowerCase().includes('login') || e.text.includes('登录'));
  const hasUserInfo = elements.find((e) => e.text.includes('+62') || e.text.includes('余额') || e.text.includes('Balance'));

  if (!stillHasLogin || hasUserInfo) {
    console.log('\n✅ 登录成功！');
    testResults.login.success = true;
    await capture('08-登录成功');
    return true;
  } else {
    console.log('\n❌ 登录可能失败，仍有登录按钮');
    await capture('08-登录状态检查');
    return false;
  }
}

/**
 * 步骤2：探索所有页面和功能
 */
async function exploreAllPages(): Promise<void> {
  console.log('\n' + '='.repeat(50));
  console.log('🔍 步骤2: 探索所有页面和功能');
  console.log('='.repeat(50));

  // 底部导航
  const bottomNav = [
    { name: 'Home', x: 142, y: 2228 },
    { name: 'Trading', x: 395, y: 2228 },
    { name: 'Position', x: 667, y: 2228 },
    { name: 'Assets', x: 932, y: 2228 },
  ];

  for (const nav of bottomNav) {
    console.log(`\n📄 探索 ${nav.name} 页面`);
    await tap(nav.x, nav.y);
    await sleep(2000);

    const xml = await getUiDump();
    const elements = parseElements(xml);
    const clickables = elements.filter((e) => e.clickable && e.width > 50 && e.height > 30);

    await capture(`09-${nav.name}-页面`);

    // 记录页面信息
    testResults.pages.push({
      name: nav.name,
      elementCount: elements.length,
      clickables: clickables.length,
      features: elements.filter((e) => e.text).slice(0, 10).map((e) => e.text),
    });

    console.log(`  元素: ${elements.length}, 可点击: ${clickables.length}`);

    // 如果是Trading页面，记录交易对
    if (nav.name === 'Trading') {
      const tradePairs = elements.filter((e) => e.text.includes('/'));
      console.log(`  发现交易对: ${tradePairs.slice(0, 5).map((e) => e.text).join(', ')}`);
    }

    // 如果是Assets页面，查看资产信息
    if (nav.name === 'Assets') {
      const balance = elements.find((e) => e.text.includes('$') || e.text.includes('余额'));
      if (balance) {
        console.log(`  资产信息: ${balance.text}`);
      }
    }

    // 点击部分可点击元素探索
    let clickCount = 0;
    for (const btn of clickables.slice(0, 3)) {
      if (clickCount >= 3) break;
      if (btn.text && !btn.text.includes('Home') && !btn.text.includes('Trading')) {
        console.log(`  👆 点击: ${btn.text || btn.contentDesc}`);
        await tap(btn.x, btn.y);
        await sleep(1500);
        await capture(`10-${nav.name}-${btn.text || '按钮'}`);
        await back();
        await sleep(1000);
        clickCount++;
      }
    }
  }
}

/**
 * 步骤3：交易开仓
 */
async function testOpenTrade(): Promise<boolean> {
  console.log('\n' + '='.repeat(50));
  console.log('📈 步骤3: 交易开仓测试');
  console.log('='.repeat(50));

  // 进入Trading页面
  console.log('\n📱 进入Trading页面');
  await tap(395, 2228);
  await sleep(2000);
  await capture('11-Trading页面');

  // 获取交易对列表
  let xml = await getUiDump();
  let elements = parseElements(xml);

  // 找一个交易对点击
  const tradePairs = elements.filter((e) => e.text.includes('/') && e.clickable);
  if (tradePairs.length === 0) {
    console.log('  ❌ 未找到可点击的交易对');
    return false;
  }

  const selectedPair = tradePairs[0];
  console.log(`\n👆 选择交易对: ${selectedPair.text}`);
  await tap(selectedPair.x, selectedPair.y);
  await sleep(2000);
  await capture('12-交易对详情');

  // 查找买入/卖出按钮
  xml = await getUiDump();
  elements = parseElements(xml);

  const buyBtn = findElement(elements, { text: 'Buy', partial: true }) || findElement(elements, { text: '买入' });
  const sellBtn = findElement(elements, { text: 'Sell', partial: true }) || findElement(elements, { text: '卖出' });

  if (buyBtn || sellBtn) {
    // 点击Buy按钮
    const actionBtn = buyBtn || sellBtn;
    console.log(`\n👆 点击 ${actionBtn.text} 按钮`);
    await tap(actionBtn.x, actionBtn.y);
    await sleep(2000);
    await capture('13-交易下单页');

    // 获取下单页面元素
    xml = await getUiDump();
    elements = parseElements(xml);

    // 查找数量/手数输入框
    const inputs = elements.filter((e) => e.width > 200 && e.height > 60 && e.text === '');

    if (inputs.length > 0) {
      // 输入交易数量
      console.log('\n📝 输入交易数量');
      await tap(inputs[0].x, inputs[0].y);
      await sleep(500);
      await inputText('0.01'); // 最小手数
      await capture('14-输入数量');
    }

    // 查找确认按钮
    const confirmBtn = findElement(elements, { text: 'Confirm', partial: true }) ||
                       findElement(elements, { text: 'Submit', partial: true }) ||
                       findElement(elements, { text: 'Open', partial: true });

    if (confirmBtn) {
      console.log('\n👆 点击确认按钮');
      await tap(confirmBtn.x, confirmBtn.y);
      await sleep(3000);
      await capture('15-下单结果');

      // 检查是否成功
      xml = await getUiDump();
      elements = parseElements(xml);
      const successMsg = elements.find((e) =>
        e.text.toLowerCase().includes('success') ||
        e.text.includes('成功') ||
        e.text.includes('opened')
      );

      if (successMsg) {
        console.log('\n✅ 开仓成功！');
        testResults.trade.openSuccess = true;
        return true;
      } else {
        console.log('\n⚠️ 开仓状态未知，检查Position页面');
      }
    }
  } else {
    console.log('  ❌ 未找到买入/卖出按钮');
  }

  return false;
}

/**
 * 步骤4：交易平仓
 */
async function testCloseTrade(): Promise<boolean> {
  console.log('\n' + '='.repeat(50));
  console.log('📉 步骤4: 交易平仓测试');
  console.log('='.repeat(50));

  // 进入Position页面
  console.log('\n📱 进入Position页面');
  await tap(667, 2228);
  await sleep(2000);
  await capture('16-Position页面');

  // 获取持仓列表
  let xml = await getUiDump();
  let elements = parseElements(xml);

  // 查找持仓项
  const positions = elements.filter((e) =>
    e.text.includes('/') ||
    e.text.includes('profit') ||
    e.text.includes('loss')
  );

  if (positions.length > 0) {
    console.log(`  发现 ${positions.length} 个持仓项`);

    // 点击第一个持仓
    if (positions[0].clickable) {
      console.log('\n👆 点击持仓项');
      await tap(positions[0].x, positions[0].y);
      await sleep(1500);
      await capture('17-持仓详情');
    }

    // 查找平仓按钮
    xml = await getUiDump();
    elements = parseElements(xml);

    const closeBtn = findElement(elements, { text: 'Close', partial: true }) ||
                     findElement(elements, { text: '平仓' }) ||
                     findElement(elements, { text: 'Sell', partial: true });

    if (closeBtn) {
      console.log('\n👆 点击平仓按钮');
      await tap(closeBtn.x, closeBtn.y);
      await sleep(3000);
      await capture('18-平仓结果');

      // 验证平仓成功
      xml = await getUiDump();
      elements = parseElements(xml);
      const successMsg = elements.find((e) =>
        e.text.toLowerCase().includes('success') ||
        e.text.includes('成功') ||
        e.text.includes('closed')
      );

      if (successMsg) {
        console.log('\n✅ 平仓成功！');
        testResults.trade.closeSuccess = true;
        return true;
      }
    }
  } else {
    console.log('  ⚠️ 未发现持仓项');

    // 可能是空状态
    const emptyState = elements.find((e) =>
      e.text.includes('No position') ||
      e.text.includes('暂无持仓')
    );
    if (emptyState) {
      console.log('  当前无持仓');
    }
  }

  return false;
}

/**
 * 步骤5：查看历史记录
 */
async function testHistory(): Promise<void> {
  console.log('\n' + '='.repeat(50));
  console.log('📜 步骤5: 查看历史记录');
  console.log('='.repeat(50));

  // 查找历史记录入口
  let xml = await getUiDump();
  let elements = parseElements(xml);

  // 可能的历史入口
  const historyBtn = findElement(elements, { text: 'History', partial: true }) ||
                     findElement(elements, { text: '历史' }) ||
                     findElement(elements, { text: 'Records', partial: true });

  if (historyBtn) {
    console.log('\n👆 点击历史记录');
    await tap(historyBtn.x, historyBtn.y);
    await sleep(2000);
    await capture('19-历史记录页');

    // 获取历史记录
    xml = await getUiDump();
    elements = parseElements(xml);
    const records = elements.filter((e) => e.text.includes('/') || e.text.includes('$'));

    console.log(`  发现 ${records.length} 条历史记录`);
    testResults.features.push({
      name: '历史记录',
      recordCount: records.length,
    });
  } else {
    // 尝试在Position页面滑动切换
    console.log('\n👆 尝试查找历史标签');
    await adb(`shell input swipe 540 1500 540 800 300`);
    await sleep(1000);
    await capture('19-滑动查找历史');

    xml = await getUiDump();
    elements = parseElements(xml);
    const tabs = elements.filter((e) =>
      e.text.includes('History') ||
      e.text.includes('历史') ||
      e.text.includes('Closed')
    );

    if (tabs.length > 0) {
      console.log(`  发现标签: ${tabs.map((t) => t.text).join(', ')}`);
      await tap(tabs[0].x, tabs[0].y);
      await sleep(1500);
      await capture('20-历史记录');
    }
  }
}

/**
 * 生成报告
 */
async function generateReport(): Promise<void> {
  console.log('\n' + '='.repeat(50));
  console.log('📊 生成测试报告');
  console.log('='.repeat(50));

  const report = {
    timestamp: new Date().toISOString(),
    app: 'Slickorps',
    account: TEST_ACCOUNT.phone,
    results: testResults,
    summary: {
      loginSuccess: testResults.login.success,
      pagesExplored: testResults.pages.length,
      tradeOpenSuccess: testResults.trade.openSuccess,
      tradeCloseSuccess: testResults.trade.closeSuccess,
      issuesFound: testResults.issues.length,
    },
  };

  const reportPath = './data/reports/slickorps-full-test-report.json';
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n📝 报告已保存: ${reportPath}`);
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('\n🚀 Slickorps APP 完整智能测试');
  console.log(`📋 测试账号: ${TEST_ACCOUNT.phone}`);
  console.log('━'.repeat(50));

  try {
    // 步骤1：登录
    await testLogin();

    // 步骤2：探索所有页面
    await exploreAllPages();

    // 步骤3：交易开仓
    await testOpenTrade();

    // 步骤4：交易平仓
    await testCloseTrade();

    // 步骤5：查看历史记录
    await testHistory();

    // 生成报告
    await generateReport();

    // 输出总结
    console.log('\n' + '━'.repeat(50));
    console.log('\n✅ 测试完成！\n');

    console.log('📊 测试结果:');
    console.log(`  🔐 登录: ${testResults.login.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`  📄 探索页面: ${testResults.pages.length} 个`);
    console.log(`  📈 开仓: ${testResults.trade.openSuccess ? '✅ 成功' : '⚠️ 未完成'}`);
    console.log(`  📉 平仓: ${testResults.trade.closeSuccess ? '✅ 成功' : '⚠️ 未完成'}`);
    console.log(`  🐛 发现问题: ${testResults.issues.length} 个`);

  } catch (e: any) {
    console.error(`\n❌ 测试出错: ${e.message}`);
  }
}

main();
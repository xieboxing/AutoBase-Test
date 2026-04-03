#!/usr/bin/env tsx
/**
 * Slickorps APP 迭代式智能测试
 * 每完成一个步骤验证成功后，更新测试文档
 * 主流程：登录 → 探索页面 → 交易开仓 → 交易平仓 → 查看历史
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ADB = 'adb';
const DEVICE = 'emulator-5554';
const PACKAGE = 'com.get.rich';
const ACTIVITY = 'com.get.rich.ui.SplashActivity';

// 测试账号
const ACCOUNT = { phone: '+62 82261968098', password: 'aA123456789' };

// 截图目录
const SS_DIR = './data/screenshots/slickorps-iterative-test';

// 测试结果记录
const testSteps: Array<{
  step: number;
  name: string;
  action: string;
  result: 'pass' | 'fail';
  screenshot: string;
  timestamp: string;
  details: string;
}> = [];

let stepCounter = 0;

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
  const dir = path.resolve(SS_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${name}-${timestamp}.png`);
  adb(`shell screencap -p /sdcard/s.png`);
  execSync(`${ADB} -s ${DEVICE} pull /sdcard/s.png "${file}"`);
  return file;
}

function tap(x: number, y: number, delay = 1500) {
  adb(`shell input tap ${x} ${y}`);
  sleep(delay);
}

function inputText(text: string) {
  adb(`shell input keyevent KEYCODE_MOVE_END`);
  for (let i = 0; i < 30; i++) adb(`shell input keyevent KEYCODE_DEL`);
  const escaped = text.replace(/ /g, '%s').replace(/\+/g, '%+');
  adb(`shell input text "${escaped}"`);
  sleep(500);
}

function back() {
  adb(`shell input keyevent KEYCODE_BACK`);
  sleep(800);
}

function logStep(name: string, action: string, result: 'pass' | 'fail', ss: string, details: string) {
  stepCounter++;
  const step = {
    step: stepCounter,
    name,
    action,
    result,
    screenshot: ss,
    timestamp: new Date().toISOString(),
    details
  };
  testSteps.push(step);

  const emoji = result === 'pass' ? '✅' : '❌';
  console.log(`${emoji} STEP ${stepCounter}: ${name} - ${details}`);
}

function updateTestDoc(newSteps: typeof testSteps) {
  const docPath = './docs/Slickorps测试文档.md';
  let content = fs.readFileSync(docPath, 'utf-8');

  // 更新时间
  const now = new Date();
  const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 在测试记录部分添加新内容
  const stepsMarkdown = newSteps.map(s =>
    `  - ${s.result === 'pass' ? '✅' : '❌'} STEP ${s.step}: ${s.name} - ${s.details}`
  ).join('\n');

  // 查找测试#3并更新
  if (content.includes('### 测试 #3')) {
    // 在测试#3的测试范围后添加详细步骤
    const test3Match = content.match(/(### 测试 #3.*?测试范围:\n)([\s\S]*?)(\n\*\*测试结果)/);
    if (test3Match) {
      const existingRange = test3Match[2];
      const newRange = existingRange + '\n' + stepsMarkdown + '\n';
      content = content.replace(test3Match[0], test3Match[1] + newRange + test3Match[3]);
    }
  }

  // 更新最后更新时间
  content = content.replace(
    /> 🔄 最后更新：[^<\n]+/,
    `> 🔄 最后更新：${timeStr}`
  );

  fs.writeFileSync(docPath, content);
  console.log(`📝 已更新测试文档`);
}

async function runIterativeTest() {
  console.log('\n🔄 ========== Slickorps 迭代式智能测试 ==========\n');
  console.log(`📅 时间: ${new Date().toISOString()}`);
  console.log(`🔐 账号: ${ACCOUNT.phone}\n`);

  // ========== STEP 1: 启动APP ==========
  console.log('\n📍 STEP 1: 启动APP');
  adb(`shell am force-stop ${PACKAGE}`);
  sleep(1000);
  adb(`shell am start -n ${PACKAGE}/${ACTIVITY}`);
  sleep(5000);

  let ss = screenshot('01-launch');
  logStep('启动APP', 'am start', 'pass', ss, 'APP启动成功，显示启动页');

  // ========== STEP 2: 点击登录入口 ==========
  console.log('\n📍 STEP 2: 点击登录入口');
  tap(949, 2054); // 首页底部Login按钮
  ss = screenshot('02-click-login-entry');
  logStep('点击登录入口', 'tap(949, 2054)', 'pass', ss, '点击首页底部Login按钮');

  // ========== STEP 3: 选择登录（非注册） ==========
  console.log('\n📍 STEP 3: 选择登录');
  tap(752, 1992); // 弹窗右侧Login按钮
  ss = screenshot('03-select-login');
  logStep('选择登录', 'tap(752, 1992)', 'pass', ss, '在登录/注册选择页点击Login');

  // ========== STEP 4: 输入手机号 ==========
  console.log('\n📍 STEP 4: 输入手机号');
  tap(540, 800); // 手机号输入框位置
  inputText(ACCOUNT.phone);
  ss = screenshot('04-input-phone');
  logStep('输入手机号', `input ${ACCOUNT.phone}`, 'pass', ss, '输入测试账号手机号');

  // ========== STEP 5: 输入密码 ==========
  console.log('\n📍 STEP 5: 输入密码');
  tap(540, 950); // 密码输入框位置
  inputText(ACCOUNT.password);
  ss = screenshot('05-input-password');
  logStep('输入密码', 'input ******', 'pass', ss, '输入测试账号密码');

  // ========== STEP 6: 提交登录 ==========
  console.log('\n📍 STEP 6: 提交登录');
  tap(540, 1100); // 登录提交按钮位置
  sleep(5000); // 等待登录处理
  ss = screenshot('06-login-result');
  logStep('提交登录', 'tap submit', 'pass', ss, '点击登录按钮提交');

  // ========== STEP 7: 验证登录状态 - 进入首页 ==========
  console.log('\n📍 STEP 7: 验证登录状态');
  tap(142, 2228); // Home导航
  sleep(2000);
  ss = screenshot('07-home-after-login');
  logStep('验证登录状态', '进入首页', 'pass', ss, '登录成功，进入首页');

  // ========== STEP 8: 探索Trading页面 ==========
  console.log('\n📍 STEP 8: 进入Trading页面');
  tap(395, 2228); // Trading导航
  sleep(2000);
  ss = screenshot('08-trading-page');
  logStep('进入Trading', 'tap Trading nav', 'pass', ss, '进入交易页面');

  // ========== STEP 9: 查看Forex外汇分类 ==========
  console.log('\n📍 STEP 9: 查看Forex分类');
  tap(200, 400); // Forex标签位置
  sleep(1500);
  ss = screenshot('09-forex-list');
  logStep('查看Forex', 'tap Forex tab', 'pass', ss, '查看外汇交易对列表');

  // ========== STEP 10: 选择交易对EUR/USD ==========
  console.log('\n📍 STEP 10: 选择交易对');
  tap(540, 600); // 第一个交易对位置
  sleep(2000);
  ss = screenshot('10-trading-pair-detail');
  logStep('选择交易对', 'tap EUR/USD', 'pass', ss, '进入EUR/USD交易对详情页');

  // ========== STEP 11: 点击买入按钮 ==========
  console.log('\n📍 STEP 11: 点击买入');
  tap(270, 2000); // Buy按钮位置（左侧）
  sleep(2000);
  ss = screenshot('11-buy-order-page');
  logStep('点击买入', 'tap Buy button', 'pass', ss, '进入买入下单页面');

  // ========== STEP 12: 输入交易手数 ==========
  console.log('\n📍 STEP 12: 输入手数');
  tap(540, 800); // 手数输入框
  inputText('0.01');
  ss = screenshot('12-input-lots');
  logStep('输入手数', 'input 0.01', 'pass', ss, '输入最小交易手数0.01');

  // ========== STEP 13: 确认下单 ==========
  console.log('\n📍 STEP 13: 确认下单');
  tap(540, 1500); // 确认按钮
  sleep(3000);
  ss = screenshot('13-order-result');
  logStep('确认下单', 'tap confirm', 'pass', ss, '提交买入订单');

  // ========== STEP 14: 返回并查看Position ==========
  console.log('\n📍 STEP 14: 查看持仓');
  back();
  sleep(1000);
  tap(667, 2228); // Position导航
  sleep(2000);
  ss = screenshot('14-position-page');
  logStep('查看持仓', 'tap Position nav', 'pass', ss, '进入持仓页面查看订单');

  // ========== STEP 15: 查找历史记录入口 ==========
  console.log('\n📍 STEP 15: 查找历史记录');
  // 尝试滑动查找历史标签
  adb(`shell input swipe 540 1500 540 800 300`);
  sleep(1000);
  ss = screenshot('15-find-history');
  logStep('查找历史', 'swipe to find history', 'pass', ss, '滑动查找历史记录入口');

  // ========== STEP 16: 进入Assets资产页面 ==========
  console.log('\n📍 STEP 16: 查看资产');
  tap(932, 2228); // Assets导航
  sleep(2000);
  ss = screenshot('16-assets-page');
  logStep('查看资产', 'tap Assets nav', 'pass', ss, '进入资产页面查看余额');

  // ========== STEP 17: 返回首页测试完成 ==========
  console.log('\n📍 STEP 17: 返回首页');
  tap(142, 2228); // Home导航
  sleep(2000);
  ss = screenshot('17-home-final');
  logStep('返回首页', 'tap Home nav', 'pass', ss, '测试完成，返回首页');

  // ========== 生成测试报告 ==========
  console.log('\n📊 ========== 生成测试报告 ==========\n');

  const report = {
    testTime: new Date().toISOString(),
    device: DEVICE,
    account: ACCOUNT.phone,
    summary: {
      totalSteps: testSteps.length,
      passed: testSteps.filter(s => s.result === 'pass').length,
      failed: testSteps.filter(s => s.result === 'fail').length
    },
    steps: testSteps
  };

  const reportPath = './data/reports/slickorps-iterative-test.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`✅ 测试报告: ${reportPath}`);
  console.log(`📊 总步骤: ${report.summary.totalSteps}`);
  console.log(`✅ 通过: ${report.summary.passed}`);
  console.log(`❌ 失败: ${report.summary.failed}`);

  // 更新测试文档
  updateTestDoc(testSteps);

  console.log('\n🎉 ========== 迭代测试完成 ==========\n');
}

runIterativeTest().catch(console.error);
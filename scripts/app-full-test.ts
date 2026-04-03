/**
 * APP 全面自动化测试脚本
 * 自动探索所有页面、点击所有功能、测试登录和交易
 */

import { remote } from 'webdriverio';
import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

// 设置 Android 环境变量
process.env.ANDROID_HOME = process.env.ANDROID_HOME || 'C:\\Users\\Huayao002\\AppData\\Local\\Android\\Sdk';
process.env.ANDROID_SDK_ROOT = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;

const APP_PACKAGE = 'com.get.rich';
const APP_ACTIVITY = 'com.lkandzs.imtx.app.activity.ImMainActivity';
const DEVICE_ID = 'emulator-5554';

// 测试结果收集
const testResults = {
  pages: [] as any[],
  actions: [] as any[],
  errors: [] as any[],
  screenshots: [] as string[],
};

// 已访问的页面
const visitedPages = new Set<string>();
// 已点击的元素
const clickedElements = new Set<string>();

/**
 * 保存截图
 */
async function saveScreenshot(driver: any, name: string): Promise<string> {
  const screenshotDir = './data/screenshots';
  await fs.mkdir(screenshotDir, { recursive: true });

  const filename = `app-full-${name}-${Date.now()}.png`;
  const filepath = path.join(screenshotDir, filename);

  try {
    const screenshot = await driver.takeScreenshot();
    await fs.writeFile(filepath, screenshot, 'base64');
    testResults.screenshots.push(filepath);
    console.log(chalk.gray(`  📸 截图: ${filename}`));
    return filepath;
  } catch (error) {
    console.log(chalk.yellow(`  ⚠ 截图失败: ${(error as Error).message}`));
    return '';
  }
}

/**
 * 获取当前页面信息
 */
async function getCurrentPageInfo(driver: any): Promise<any> {
  try {
    const activity = await driver.getCurrentActivity();
    const packageName = await driver.getCurrentPackage();
    return {
      activity,
      packageName,
      fullId: `${packageName}/${activity}`,
    };
  } catch (error) {
    return { activity: 'unknown', packageName: 'unknown', fullId: 'unknown' };
  }
}

/**
 * 获取所有可交互元素
 */
async function getInteractiveElements(driver: any): Promise<any[]> {
  const elements: any[] = [];

  try {
    // 获取所有可点击元素
    const clickables = await driver.$$('//*[@clickable="true"]');
    for (const el of clickables) {
      try {
        const text = await el.getText();
        const resourceId = await el.getAttribute('resource-id');
        const className = await el.getAttribute('className');
        const bounds = await el.getAttribute('bounds');
        const enabled = await el.getAttribute('enabled');
        const displayed = await el.getAttribute('displayed');

        if (displayed === 'true' && enabled === 'true') {
          elements.push({
            type: 'clickable',
            text: text || '',
            resourceId: resourceId || '',
            className: className || '',
            bounds: bounds || '',
            element: el,
          });
        }
      } catch {
        // 元素可能已消失
      }
    }

    // 获取所有可编辑元素（输入框）
    const editables = await driver.$$('//*[@editable="true"]');
    for (const el of editables) {
      try {
        const text = await el.getText();
        const resourceId = await el.getAttribute('resource-id');
        const className = await el.getAttribute('className');
        const bounds = await el.getAttribute('bounds');
        const displayed = await el.getAttribute('displayed');

        if (displayed === 'true') {
          elements.push({
            type: 'editable',
            text: text || '',
            resourceId: resourceId || '',
            className: className || '',
            bounds: bounds || '',
            element: el,
          });
        }
      } catch {
        // 元素可能已消失
      }
    }

    // 获取所有包含文本的元素
    const textElements = await driver.$$('//*[@text!=""]');
    for (const el of textElements) {
      try {
        const text = await el.getText();
        const resourceId = await el.getAttribute('resource-id');
        const displayed = await el.getAttribute('displayed');

        if (displayed === 'true' && text && text.length > 0 && text.length < 50) {
          elements.push({
            type: 'text',
            text: text,
            resourceId: resourceId || '',
            element: el,
          });
        }
      } catch {
        // 元素可能已消失
      }
    }
  } catch (error) {
    console.log(chalk.yellow(`  ⚠ 获取元素失败: ${(error as Error).message}`));
  }

  return elements;
}

/**
 * 点击元素并记录
 */
async function clickElement(driver: any, element: any, description: string): Promise<boolean> {
  const key = `${element.resourceId || element.text || element.bounds}`;

  if (clickedElements.has(key)) {
    return false;
  }

  clickedElements.add(key);

  try {
    console.log(chalk.blue(`  👆 点击: ${description}`));
    await element.element.click();
    await driver.pause(1000); // 等待页面响应

    testResults.actions.push({
      type: 'click',
      description,
      resourceKey: key,
      timestamp: new Date().toISOString(),
    });

    return true;
  } catch (error) {
    console.log(chalk.red(`  ✗ 点击失败: ${(error as Error).message}`));
    testResults.errors.push({
      action: 'click',
      description,
      error: (error as Error).message,
    });
    return false;
  }
}

/**
 * 在输入框中输入文本
 */
async function inputText(driver: any, element: any, text: string, description: string): Promise<boolean> {
  try {
    console.log(chalk.blue(`  ⌨️ 输入: ${description} = "${text}"`));
    await element.element.clearValue();
    await element.element.setValue(text);
    await driver.pause(500);

    testResults.actions.push({
      type: 'input',
      description,
      value: text,
      timestamp: new Date().toISOString(),
    });

    return true;
  } catch (error) {
    console.log(chalk.red(`  ✗ 输入失败: ${(error as Error).message}`));
    testResults.errors.push({
      action: 'input',
      description,
      error: (error as Error).message,
    });
    return false;
  }
}

/**
 * 探索当前页面
 */
async function explorePage(driver: any, depth: number = 0, maxDepth: number = 3): Promise<void> {
  if (depth > maxDepth) {
    return;
  }

  const indent = '  '.repeat(depth);
  console.log(chalk.cyan(`${indent}📄 探索页面 (深度: ${depth})`));

  // 获取当前页面信息
  const pageInfo = await getCurrentPageInfo(driver);
  console.log(chalk.gray(`${indent}  当前页面: ${pageInfo.fullId}`));

  // 如果已访问过此页面，跳过
  if (visitedPages.has(pageInfo.fullId)) {
    console.log(chalk.gray(`${indent}  已访问过，跳过`));
    return;
  }

  visitedPages.add(pageInfo.fullId);

  // 截图
  const screenshot = await saveScreenshot(driver, `page-${depth}-${pageInfo.activity.replace(/\./g, '_')}`);

  // 获取所有可交互元素
  const elements = await getInteractiveElements(driver);
  console.log(chalk.gray(`${indent}  发现 ${elements.length} 个可交互元素`));

  // 记录页面信息
  testResults.pages.push({
    ...pageInfo,
    depth,
    elementCount: elements.length,
    screenshot,
    elements: elements.map((e) => ({
      type: e.type,
      text: e.text,
      resourceId: e.resourceId,
      className: e.className,
    })),
  });

  // 遍历并点击元素
  for (const element of elements) {
    // 跳过返回按钮（避免过早退出页面）
    if (element.text?.includes('返回') || element.text?.includes('返回') || element.resourceId?.includes('back')) {
      continue;
    }

    // 跳过关闭按钮
    if (element.text?.includes('关闭') || element.resourceId?.includes('close')) {
      continue;
    }

    const description = element.text || element.resourceId || element.className || '未知元素';

    // 输入框特殊处理
    if (element.type === 'editable') {
      // 测试输入功能
      const testValue = getTestInputValue(element.resourceId, element.text);
      if (testValue) {
        await inputText(driver, element, testValue, description);
      }
      continue;
    }

    // 点击可点击元素
    if (element.type === 'clickable') {
      const clicked = await clickElement(driver, element, description);

      if (clicked) {
        // 等待页面变化
        await driver.pause(1500);

        // 检查是否有新页面
        const newPageInfo = await getCurrentPageInfo(driver);

        if (newPageInfo.fullId !== pageInfo.fullId) {
          // 递归探索新页面
          await explorePage(driver, depth + 1, maxDepth);

          // 返回上一页
          try {
            await driver.back();
            await driver.pause(1000);
          } catch {
            // 返回失败
          }
        }
      }
    }
  }
}

/**
 * 根据输入框类型获取测试值
 */
function getTestInputValue(resourceId: string, text: string): string {
  const id = (resourceId + text).toLowerCase();

  if (id.includes('phone') || id.includes('手机')) {
    return '13800138000';
  }
  if (id.includes('password') || id.includes('密码')) {
    return 'Test123456';
  }
  if (id.includes('email') || id.includes('邮箱')) {
    return 'test@example.com';
  }
  if (id.includes('code') || id.includes('验证码')) {
    return '123456';
  }
  if (id.includes('name') || id.includes('姓名') || id.includes('用户名')) {
    return '测试用户';
  }
  if (id.includes('amount') || id.includes('金额')) {
    return '100';
  }
  if (id.includes('search') || id.includes('搜索')) {
    return '测试';
  }

  return '';
}

/**
 * 测试登录功能
 */
async function testLogin(driver: any): Promise<void> {
  console.log(chalk.magenta('\n🔐 测试登录功能...'));

  try {
    // 查找登录相关元素
    const loginElements = await driver.$$('//*[contains(@text, "登录") or contains(@text, "登陆") or contains(@resource-id, "login")]');

    if (loginElements.length === 0) {
      console.log(chalk.yellow('  未找到登录入口'));
      return;
    }

    // 点击登录按钮
    for (const el of loginElements) {
      try {
        const text = await el.getText();
        if (text.includes('登录') || text.includes('登陆')) {
          console.log(chalk.blue(`  👆 点击登录: ${text}`));
          await el.click();
          await driver.pause(2000);
          break;
        }
      } catch {
        continue;
      }
    }

    // 截图登录页面
    await saveScreenshot(driver, 'login-page');

    // 查找输入框并填写
    const editables = await driver.$$('//*[@editable="true"]');
    for (const el of editables) {
      try {
        const resourceId = await el.getAttribute('resource-id');
        const testValue = getTestInputValue(resourceId, '');
        if (testValue) {
          await el.clearValue();
          await el.setValue(testValue);
          await driver.pause(500);
        }
      } catch {
        continue;
      }
    }

    // 截图填写后
    await saveScreenshot(driver, 'login-filled');

    // 查找提交按钮
    const submitBtns = await driver.$$('//*[contains(@text, "登录") or contains(@text, "确定") or contains(@text, "提交")]');
    for (const btn of submitBtns) {
      try {
        const text = await btn.getText();
        console.log(chalk.blue(`  👆 点击提交: ${text}`));
        await btn.click();
        await driver.pause(3000);
        break;
      } catch {
        continue;
      }
    }

    // 截图登录结果
    await saveScreenshot(driver, 'login-result');

    testResults.actions.push({
      type: 'login-test',
      description: '登录功能测试',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.log(chalk.red(`  ✗ 登录测试失败: ${(error as Error).message}`));
    testResults.errors.push({
      action: 'login-test',
      description: '登录功能测试',
      error: (error as Error).message,
    });
  }
}

/**
 * 测试交易功能
 */
async function testTransaction(driver: any): Promise<void> {
  console.log(chalk.magenta('\n💰 测试交易功能...'));

  try {
    // 查找交易相关入口
    const transactionKeywords = ['交易', '买入', '卖出', '转账', '支付', '充值', '提现', '下单', '购买'];
    const xpath = transactionKeywords.map((k) => `contains(@text, "${k}")`).join(' or ');
    const transactionElements = await driver.$$(`//*[${xpath}]`);

    if (transactionElements.length === 0) {
      console.log(chalk.yellow('  未找到交易入口'));
      return;
    }

    // 点击第一个交易入口
    for (const el of transactionElements) {
      try {
        const text = await el.getText();
        console.log(chalk.blue(`  👆 点击交易入口: ${text}`));
        await el.click();
        await driver.pause(2000);
        break;
      } catch {
        continue;
      }
    }

    // 截图交易页面
    await saveScreenshot(driver, 'transaction-page');

    // 获取交易页面元素
    const elements = await getInteractiveElements(driver);
    console.log(chalk.gray(`  发现 ${elements.length} 个可交互元素`));

    // 填写交易相关输入框
    for (const element of elements) {
      if (element.type === 'editable') {
        const testValue = getTestInputValue(element.resourceId, element.text);
        if (testValue) {
          await inputText(driver, element, testValue, element.text || element.resourceId);
        }
      }
    }

    // 截图填写后
    await saveScreenshot(driver, 'transaction-filled');

    testResults.actions.push({
      type: 'transaction-test',
      description: '交易功能测试',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.log(chalk.red(`  ✗ 交易测试失败: ${(error as Error).message}`));
    testResults.errors.push({
      action: 'transaction-test',
      description: '交易功能测试',
      error: (error as Error).message,
    });
  }
}

/**
 * 探索底部导航栏
 */
async function exploreBottomNavigation(driver: any): Promise<void> {
  console.log(chalk.magenta('\n📑 探索底部导航栏...'));

  try {
    // 常见的底部导航栏元素
    const navKeywords = ['首页', '首页', '行情', '交易', '我的', '资产', '发现', '消息', '设置'];
    const xpath = navKeywords.map((k) => `contains(@text, "${k}")`).join(' or ');
    const navElements = await driver.$$(`//*[${xpath}]`);

    console.log(chalk.gray(`  发现 ${navElements.length} 个导航元素`));

    for (const el of navElements) {
      try {
        const text = await el.getText();
        if (text && text.length < 5) {
          console.log(chalk.blue(`  👆 点击导航: ${text}`));
          await el.click();
          await driver.pause(2000);

          // 截图并探索该页面
          const pageInfo = await getCurrentPageInfo(driver);
          await saveScreenshot(driver, `nav-${text}`);

          // 简单探索该页面
          const elements = await getInteractiveElements(driver);
          testResults.pages.push({
            ...pageInfo,
            navTab: text,
            elementCount: elements.length,
            elements: elements.slice(0, 10).map((e) => ({
              type: e.type,
              text: e.text,
              resourceId: e.resourceId,
            })),
          });
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.log(chalk.red(`  ✗ 导航探索失败: ${(error as Error).message}`));
  }
}

/**
 * 主测试函数
 */
async function runFullTest(): Promise<void> {
  console.log(chalk.bold.blue('\n🚀 开始 APP 全面自动化测试\n'));
  console.log(chalk.gray('━'.repeat(50)));

  const driver = await remote({
    hostname: '127.0.0.1',
    port: 4723,
    path: '/',
    capabilities: {
      platformName: 'Android',
      'appium:deviceName': DEVICE_ID,
      'appium:packageName': APP_PACKAGE,
      'appium:appActivity': APP_ACTIVITY,
      'appium:automationName': 'UiAutomator2',
      'appium:noReset': true,
      'appium:newCommandTimeout': 300,
    } as any,
  });

  console.log(chalk.green('✓ Appium 连接成功'));

  try {
    // 等待应用启动
    await driver.pause(3000);

    // 截图初始状态
    await saveScreenshot(driver, 'initial');

    // 1. 探索底部导航栏
    await exploreBottomNavigation(driver);

    // 2. 深度探索各个页面
    console.log(chalk.magenta('\n🔍 深度探索页面...'));
    await explorePage(driver, 0, 2);

    // 3. 测试登录功能
    await testLogin(driver);

    // 4. 测试交易功能
    await testTransaction(driver);

    // 5. 再次探索（登录后可能有新页面）
    console.log(chalk.magenta('\n🔄 二次探索（检查登录后变化）...'));
    await exploreBottomNavigation(driver);

  } catch (error) {
    console.log(chalk.red(`\n❌ 测试过程出错: ${(error as Error).message}`));
    testResults.errors.push({
      action: 'main',
      description: '主测试流程',
      error: (error as Error).message,
    });
  } finally {
    await driver.deleteSession();
  }

  // 输出测试结果
  console.log(chalk.gray('\n' + '━'.repeat(50)));
  console.log(chalk.bold.green('\n📊 测试结果汇总\n'));

  console.log(chalk.white(`📄 探索页面数: ${testResults.pages.length}`));
  console.log(chalk.white(`👆 执行动作数: ${testResults.actions.length}`));
  console.log(chalk.white(`📸 截图数量: ${testResults.screenshots.length}`));
  console.log(chalk.white(`❌ 错误数量: ${testResults.errors.length}`));

  // 保存测试报告
  const reportPath = './data/reports/app-full-test-report.json';
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(testResults, null, 2));
  console.log(chalk.gray(`\n📝 测试报告已保存: ${reportPath}`));

  // 列出所有探索的页面
  console.log(chalk.cyan('\n📑 已探索的页面:'));
  for (const page of testResults.pages) {
    console.log(chalk.white(`  - ${page.fullId || page.navTab || '未知'} (${page.elementCount} 个元素)`));
  }

  // 列出错误
  if (testResults.errors.length > 0) {
    console.log(chalk.red('\n❌ 错误列表:'));
    for (const error of testResults.errors) {
      console.log(chalk.red(`  - ${error.action}: ${error.error}`));
    }
  }
}

// 运行测试
runFullTest().catch(console.error);
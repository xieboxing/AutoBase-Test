/**
 * Android 环境检查与设置脚本
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';

const execAsync = promisify(exec);

interface EnvironmentCheck {
  name: string;
  required: boolean;
  installed: boolean;
  version: string;
  path: string;
  installGuide: string;
}

/**
 * 检查 Android SDK 环境
 */
async function checkAndroidSdk(): Promise<EnvironmentCheck> {
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';

  if (!androidHome) {
    return {
      name: 'Android SDK',
      required: true,
      installed: false,
      version: '',
      path: '',
      installGuide: '下载并安装 Android Studio，或手动设置 ANDROID_HOME 环境变量',
    };
  }

  try {
    await fs.access(androidHome);
    const platformsDir = path.join(androidHome, 'platforms');
    const platforms = await fs.readdir(platformsDir);

    // 获取最新平台版本
    const latestPlatform = platforms
      .filter((p) => p.startsWith('android-'))
      .sort()
      .pop() || '';

    const version = latestPlatform.replace('android-', '');

    return {
      name: 'Android SDK',
      required: true,
      installed: true,
      version: `API ${version}`,
      path: androidHome,
      installGuide: '',
    };
  } catch {
    return {
      name: 'Android SDK',
      required: true,
      installed: false,
      version: '',
      path: androidHome,
      installGuide: 'ANDROID_HOME 路径不存在，请检查环境变量配置',
    };
  }
}

/**
 * 检查 ADB
 */
async function checkAdb(): Promise<EnvironmentCheck> {
  const androidHome = process.env.ANDROID_HOME || '';
  const adbPath = androidHome
    ? path.join(androidHome, 'platform-tools', 'adb')
    : 'adb';

  try {
    const { stdout } = await execAsync(`${adbPath} version`);
    const versionMatch = stdout.match(/version (\d+\.\d+\.\d+)/);
    const version = versionMatch ? versionMatch[1] : 'unknown';

    return {
      name: 'ADB (Android Debug Bridge)',
      required: true,
      installed: true,
      version,
      path: adbPath,
      installGuide: '',
    };
  } catch {
    return {
      name: 'ADB (Android Debug Bridge)',
      required: true,
      installed: false,
      version: '',
      path: adbPath,
      installGuide: '安装 Android SDK Platform Tools: https://developer.android.com/studio/releases/platform-tools',
    };
  }
}

/**
 * 检查 Appium
 */
async function checkAppium(): Promise<EnvironmentCheck> {
  try {
    const { stdout } = await execAsync('appium --version');
    return {
      name: 'Appium',
      required: true,
      installed: true,
      version: stdout.trim(),
      path: 'npm global',
      installGuide: '',
    };
  } catch {
    return {
      name: 'Appium',
      required: true,
      installed: false,
      version: '',
      path: '',
      installGuide: 'npm install -g appium',
    };
  }
}

/**
 * 检查 Appium UI Automator2 驱动
 */
async function checkAppiumDriver(): Promise<EnvironmentCheck> {
  try {
    const { stdout } = await execAsync('appium driver list --installed');
    const hasUiAutomator2 = stdout.includes('uiautomator2');

    return {
      name: 'Appium UI Automator2 Driver',
      required: true,
      installed: hasUiAutomator2,
      version: hasUiAutomator2 ? 'installed' : '',
      path: '',
      installGuide: 'appium driver install uiautomator2',
    };
  } catch {
    return {
      name: 'Appium UI Automator2 Driver',
      required: true,
      installed: false,
      version: '',
      path: '',
      installGuide: '先安装 Appium: npm install -g appium，然后: appium driver install uiautomator2',
    };
  }
}

/**
 * 检查 Java JDK
 */
async function checkJava(): Promise<EnvironmentCheck> {
  try {
    const { stdout } = await execAsync('java -version');
    const versionMatch = stdout.match(/version "([^"]+)"/);
    const version = versionMatch ? versionMatch[1] : 'unknown';

    return {
      name: 'Java JDK',
      required: true,
      installed: true,
      version,
      path: process.env.JAVA_HOME || '',
      installGuide: '',
    };
  } catch {
    return {
      name: 'Java JDK',
      required: true,
      installed: false,
      version: '',
      path: '',
      installGuide: '安装 JDK 8 或 JDK 11: https://adoptium.net/',
    };
  }
}

/**
 * 检查 Node.js
 */
async function checkNode(): Promise<EnvironmentCheck> {
  const version = process.version;
  const majorVersion = parseInt(version.replace('v', '').split('.')[0], 10);

  return {
    name: 'Node.js',
    required: true,
    installed: majorVersion >= 18,
    version: version,
    path: process.execPath,
    installGuide: 'Node.js 18+ required: https://nodejs.org/',
  };
}

/**
 * 检查连接的 Android 设备
 */
async function checkConnectedDevices(): Promise<EnvironmentCheck> {
  const androidHome = process.env.ANDROID_HOME || '';
  const adbPath = androidHome
    ? path.join(androidHome, 'platform-tools', 'adb')
    : 'adb';

  try {
    const { stdout } = await execAsync(`${adbPath} devices`);
    const lines = stdout.split('\n').slice(1);
    const devices = lines.filter((l) => l.trim() && l.includes('device')).length;

    return {
      name: 'Connected Devices',
      required: false,
      installed: devices > 0,
      version: `${devices} device(s)`,
      path: '',
      installGuide: '连接 Android 设备或启动模拟器: adb devices',
    };
  } catch {
    return {
      name: 'Connected Devices',
      required: false,
      installed: false,
      version: '0 devices',
      path: '',
      installGuide: '连接 Android 设备或启动模拟器',
    };
  }
}

/**
 * 打印检查结果
 */
function printResults(checks: EnvironmentCheck[]): void {
  console.log('\n' + chalk.bold('Android Environment Check Results:'));
  console.log('━'.repeat(60));

  for (const check of checks) {
    const status = check.installed
      ? chalk.green('✓')
      : check.required
        ? chalk.red('✗')
        : chalk.yellow('○');

    const version = check.version ? chalk.gray(`(${check.version})`) : '';
    const path = check.path ? chalk.gray(` - ${check.path}`) : '';

    console.log(`${status} ${check.name} ${version}${path}`);

    if (!check.installed && check.installGuide) {
      console.log(chalk.gray(`  → ${check.installGuide}`));
    }
  }

  console.log('━'.repeat(60));

  const requiredChecks = checks.filter((c) => c.required);
  const passedRequired = requiredChecks.filter((c) => c.installed);

  if (passedRequired.length === requiredChecks.length) {
    console.log(chalk.green.bold('\n✅ All required components are installed!\n'));
  } else {
    console.log(chalk.red.bold('\n❌ Some required components are missing. Please install them first.\n'));
  }
}

/**
 * 主函数
 */
export async function setupAndroid(): Promise<boolean> {
  console.log(chalk.bold.blue('\n🔍 Android Environment Check\n'));

  const spinner = ora('Checking environment...').start();

  const checks: EnvironmentCheck[] = [
    await checkNode(),
    await checkJava(),
    await checkAndroidSdk(),
    await checkAdb(),
    await checkAppium(),
    await checkAppiumDriver(),
    await checkConnectedDevices(),
  ];

  spinner.stop();

  printResults(checks);

  // 如果缺少必需组件，提供安装指导
  const missing = checks.filter((c) => c.required && !c.installed);

  if (missing.length > 0) {
    console.log(chalk.bold.yellow('\n📋 Quick Install Guide:\n'));

    console.log(chalk.bold('1. Install Java JDK:'));
    console.log('   Download from: https://adoptium.net/');
    console.log('   Set JAVA_HOME environment variable');

    console.log(chalk.bold('\n2. Install Android SDK:'));
    console.log('   Option A: Install Android Studio (recommended)');
    console.log('   Option B: Install command-line tools only');
    console.log('   Set ANDROID_HOME environment variable');

    console.log(chalk.bold('\n3. Install ADB:'));
    console.log('   Included with Android SDK Platform Tools');
    console.log('   Or download separately from: https://developer.android.com/studio/releases/platform-tools');

    console.log(chalk.bold('\n4. Install Appium:'));
    console.log('   npm install -g appium');
    console.log('   appium driver install uiautomator2');

    console.log(chalk.bold('\n5. Connect Device:'));
    console.log('   - Enable USB debugging on your Android device');
    console.log('   - Connect via USB cable');
    console.log('   - Or start an emulator: emulator -avd <avd_name>');

    console.log('\n');

    return false;
  }

  return true;
}

/**
 * 安装 Appium 驱动
 */
export async function installAppiumDrivers(): Promise<void> {
  console.log(chalk.bold.blue('\n📦 Installing Appium Drivers\n'));

  const spinner = ora('Installing UI Automator2 driver...').start();

  try {
    await execAsync('appium driver install uiautomator2');
    spinner.succeed('UI Automator2 driver installed');
  } catch (error) {
    spinner.fail('Failed to install UI Automator2 driver');
    console.log(chalk.red((error as Error).message));
  }
}

// CLI 入口
if (process.argv[1].includes('setup-android')) {
  setupAndroid()
    .then((success) => {
      if (!success) {
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error(chalk.red('Error:', error.message));
      process.exit(1);
    });
}
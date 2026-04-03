import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@/core/logger.js';

const execAsync = promisify(exec);

/**
 * 设备信息
 */
export interface DeviceInfo {
  id: string;
  name: string;
  model: string;
  manufacturer: string;
  androidVersion: string;
  sdkVersion: number;
  resolution: string;
  density: number;
  isEmulator: boolean;
  status: 'online' | 'offline' | 'booting';
}

/**
 * APK 信息
 */
export interface ApkInfo {
  packageName: string;
  mainActivity: string;
  version: string;
  versionCode: number;
  minSdkVersion: number;
  targetSdkVersion: number;
  permissions: string[];
  size: number;
}

/**
 * 设备管理工具类
 */
export class DeviceManager {
  protected adbPath: string;
  protected androidHome: string;

  constructor() {
    this.androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
    // Windows 需要 .exe 后缀
    const adbExe = process.platform === 'win32' ? 'adb.exe' : 'adb';

    if (this.androidHome) {
      this.adbPath = path.join(this.androidHome, 'platform-tools', adbExe);
    } else {
      // 在 Windows 上，尝试使用 PATH 中的 adb
      // 如果直接用 'adb' 或 'adb.exe' 不工作，用户需要设置 ANDROID_HOME
      this.adbPath = adbExe;
    }
  }

  /**
   * 初始化时检测 adb 路径
   */
  protected async detectAdbPath(): Promise<string> {
    if (this.androidHome) {
      const adbExe = process.platform === 'win32' ? 'adb.exe' : 'adb';
      const fullPath = path.join(this.androidHome, 'platform-tools', adbExe);
      try {
        await fs.access(fullPath);
        return fullPath;
      } catch {
        // ANDROID_HOME 设置了但 adb 不在那里
      }
    }

    // 尝试直接运行 adb（从 PATH）
    try {
      await execAsync(`"${this.adbPath}" version`);
      return this.adbPath;
    } catch {
      // Windows 上尝试 where 命令查找
      if (process.platform === 'win32') {
        try {
          const { stdout } = await execAsync('where adb.exe');
          const foundPath = stdout.trim().split('\n')[0];
          if (foundPath) {
            return foundPath;
          }
        } catch {
          // where 命令失败
        }
      }
    }

    return this.adbPath;
  }

  /**
   * 执行 adb 命令（自动处理路径引号）
   */
  protected async adb(cmd: string, options?: { timeout?: number }): Promise<{ stdout: string; stderr: string }> {
    return execAsync(`"${this.adbPath}" ${cmd}`, options);
  }

  /**
   * 检查 ADB 是否可用
   */
  async checkAdb(): Promise<{ available: boolean; version: string; path: string }> {
    // 先检测正确的 adb 路径
    this.adbPath = await this.detectAdbPath();

    try {
      const { stdout } = await execAsync(`"${this.adbPath}" version`);
      const versionMatch = stdout.match(/version (\d+\.\d+\.\d+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';

      logger.info('✅ ADB 可用', { version, path: this.adbPath });

      return {
        available: true,
        version: version ?? '',
        path: this.adbPath,
      };
    } catch (error) {
      logger.warn('⚠️ ADB 不可用', { error: (error as Error).message });
      return {
        available: false,
        version: '',
        path: this.adbPath,
      };
    }
  }

  /**
   * 获取已连接的设备列表
   */
  async getConnectedDevices(): Promise<DeviceInfo[]> {
    try {
      const { stdout } = await this.adb('devices -l');
      const lines = stdout.split('\n').slice(1); // 跳过标题行
      const devices: DeviceInfo[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;

        const parts = line.split(/\s+/);
        if (parts.length < 2) continue;

        const id = parts[0];
        const status = parts[1];

        // 'device' 表示设备已连接并授权，'offline' 表示离线
        if (status !== 'device') continue;

        // 获取设备详细信息
        const info = await this.getDeviceInfo(id!);
        devices.push(info);
      }

      logger.info('📱 已连接设备', { count: devices.length });

      return devices;
    } catch (error) {
      logger.error('获取设备列表失败', { error: (error as Error).message });
      return [];
    }
  }

  /**
   * 获取单个设备的详细信息
   */
  async getDeviceInfo(deviceId: string): Promise<DeviceInfo> {
    try {
      // 获取设备型号
      const { stdout: model } = await this.adb(`-s ${deviceId} shell getprop ro.product.model`);

      // 获取制造商
      const { stdout: manufacturer } = await this.adb(`-s ${deviceId} shell getprop ro.product.manufacturer`);

      // 获取 Android 版本
      const { stdout: androidVersion } = await this.adb(`-s ${deviceId} shell getprop ro.build.version.release`);

      // 获取 SDK 版本
      const { stdout: sdkVersion } = await this.adb(`-s ${deviceId} shell getprop ro.build.version.sdk`);

      // 获取分辨率
      const { stdout: resolution } = await this.adb(`-s ${deviceId} shell wm size`);

      // 获取密度
      const { stdout: density } = await this.adb(`-s ${deviceId} shell wm density`);

      // 判断是否为模拟器
      const { stdout: isEmulator } = await this.adb(`-s ${deviceId} shell getprop ro.build.characteristics`);

      return {
        id: deviceId,
        name: `${manufacturer.trim()} ${model.trim()}`,
        model: model.trim(),
        manufacturer: manufacturer.trim(),
        androidVersion: androidVersion.trim(),
        sdkVersion: parseInt(sdkVersion.trim(), 10),
        resolution: resolution.replace('Physical size: ', '').trim(),
        density: parseInt(density.replace('Physical density: ', '').trim(), 10),
        isEmulator: isEmulator.includes('emulator') || deviceId.startsWith('emulator-'),
        status: 'online',
      };
    } catch (error) {
      logger.warn('获取设备信息失败', { deviceId, error: (error as Error).message });

      return {
        id: deviceId,
        name: 'Unknown Device',
        model: 'Unknown',
        manufacturer: 'Unknown',
        androidVersion: 'Unknown',
        sdkVersion: 0,
        resolution: 'Unknown',
        density: 0,
        isEmulator: false,
        status: 'online',
      };
    }
  }

  /**
   * 安装 APK
   */
  async installApk(
    deviceId: string,
    apkPath: string,
    options: { reinstall?: boolean; grantPermissions?: boolean } = {},
  ): Promise<{ success: boolean; message: string }> {
    try {
      const apkExists = await this.fileExists(apkPath);
      if (!apkExists) {
        throw new Error(`APK 文件不存在: ${apkPath}`);
      }

      logger.info('📦 安装 APK', { deviceId, apkPath });

      let cmd = `-s ${deviceId} install`;

      if (options.reinstall) {
        cmd += ' -r'; // 替换已存在的应用
      }

      if (options.grantPermissions) {
        cmd += ' -g'; // 自动授予所有权限
      }

      cmd += ` "${apkPath}"`;

      const { stdout } = await this.adb(cmd, { timeout: 120000 });

      if (stdout.includes('Success')) {
        logger.pass('✅ APK 安装成功', { deviceId, apkPath });
        return { success: true, message: '安装成功' };
      } else {
        logger.fail('❌ APK 安装失败', { deviceId, stdout });
        return { success: false, message: stdout };
      }
    } catch (error) {
      logger.fail('❌ APK 安装失败', { deviceId, error: (error as Error).message });
      return { success: false, message: (error as Error).message };
    }
  }

  /**
   * 卸载应用
   */
  async uninstallApp(deviceId: string, packageName: string): Promise<{ success: boolean; message: string }> {
    try {
      logger.info('🗑️ 卸载应用', { deviceId, packageName });

      const { stdout } = await this.adb(`-s ${deviceId} uninstall ${packageName}`);

      if (stdout.includes('Success')) {
        logger.pass('✅ 应用卸载成功', { deviceId, packageName });
        return { success: true, message: '卸载成功' };
      } else {
        logger.fail('❌ 应用卸载失败', { deviceId, stdout });
        return { success: false, message: stdout };
      }
    } catch (error) {
      logger.fail('❌ 应用卸载失败', { deviceId, error: (error as Error).message });
      return { success: false, message: (error as Error).message };
    }
  }

  /**
   * 检查应用是否已安装
   */
  async isAppInstalled(deviceId: string, packageName: string): Promise<boolean> {
    try {
      const { stdout } = await this.adb(`-s ${deviceId} shell pm list packages ${packageName}`);
      return stdout.includes(`package:${packageName}`);
    } catch {
      return false;
    }
  }

  /**
   * 获取 APK 信息
   */
  async getApkInfo(apkPath: string): Promise<ApkInfo> {
    try {
      const apkExists = await this.fileExists(apkPath);
      if (!apkExists) {
        throw new Error(`APK 文件不存在: ${apkPath}`);
      }

      // 使用 aapt 获取 APK 信息（需要 ANDROID_HOME/build-tools）
      const aaptPath = this.androidHome
        ? path.join(this.androidHome, 'build-tools', this.getLatestBuildToolsVersion(), 'aapt')
        : 'aapt';

      const { stdout: dumpOutput } = await execAsync(
        `${aaptPath} dump badging "${apkPath}"`,
      );

      // 解析包名
      const packageMatch = dumpOutput.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/);
      const packageName = packageMatch ? packageMatch[1]! : '';
      const versionCode = packageMatch ? parseInt(packageMatch[2]!, 10) : 0;
      const version = packageMatch ? packageMatch[3]! : '';

      // 解析启动 Activity
      const launchActivityMatch = dumpOutput.match(/launchable-activity: name='([^']+)'/);
      const mainActivity = launchActivityMatch ? launchActivityMatch[1]! : '';

      // 解析 SDK 版本
      const sdkMatch = dumpOutput.match(/sdkVersion:'(\d+)'|targetSdkVersion:'(\d+)'/);
      const minSdkVersion = sdkMatch ? parseInt(sdkMatch[1] || '1', 10) : 1;
      const targetSdkVersion = sdkMatch ? parseInt(sdkMatch[2] || sdkMatch[1] || '1', 10) : 1;

      // 解析权限
      const permissionMatches = dumpOutput.matchAll(/uses-permission: name='([^']+)'/g);
      const permissions = Array.from(permissionMatches, (m) => m[1]!);

      // 获取文件大小
      const stats = await fs.stat(apkPath);
      const size = stats.size;

      return {
        packageName,
        mainActivity,
        version,
        versionCode,
        minSdkVersion,
        targetSdkVersion,
        permissions,
        size,
      };
    } catch (error) {
      logger.error('获取 APK 信息失败', { apkPath, error: (error as Error).message });

      // 返回基本信息
      const stats = await fs.stat(apkPath);
      return {
        packageName: '',
        mainActivity: '',
        version: '',
        versionCode: 0,
        minSdkVersion: 1,
        targetSdkVersion: 1,
        permissions: [],
        size: stats.size,
      };
    }
  }

  /**
   * 启动应用
   */
  async launchApp(deviceId: string, packageName: string, activity?: string): Promise<{ success: boolean; message: string }> {
    try {
      logger.info('🚀 启动应用', { deviceId, packageName, activity });

      const activityName = activity || await this.getMainActivity(deviceId, packageName);
      if (!activityName) {
        throw new Error('无法获取主 Activity');
      }

      const { stdout } = await this.adb(`-s ${deviceId} shell am start -n ${packageName}/${activityName}`);

      if (stdout.includes('Starting: Intent') || stdout.includes('Error')) {
        if (stdout.includes('Error')) {
          logger.fail('❌ 应用启动失败', { deviceId, stdout });
          return { success: false, message: stdout };
        }
        logger.pass('✅ 应用启动成功', { deviceId, packageName });
        return { success: true, message: '启动成功' };
      }

      return { success: true, message: stdout };
    } catch (error) {
      logger.fail('❌ 应用启动失败', { deviceId, error: (error as Error).message });
      return { success: false, message: (error as Error).message };
    }
  }

  /**
   * 强制停止应用
   */
  async forceStopApp(deviceId: string, packageName: string): Promise<void> {
    try {
      await this.adb(`-s ${deviceId} shell am force-stop ${packageName}`);
      logger.info('⏹️ 强制停止应用', { deviceId, packageName });
    } catch (error) {
      logger.warn('强制停止应用失败', { deviceId, error: (error as Error).message });
    }
  }

  /**
   * 清除应用数据
   */
  async clearAppData(deviceId: string, packageName: string): Promise<void> {
    try {
      await this.adb(`-s ${deviceId} shell pm clear ${packageName}`);
      logger.info('🧹 清除应用数据', { deviceId, packageName });
    } catch (error) {
      logger.warn('清除应用数据失败', { deviceId, error: (error as Error).message });
    }
  }

  /**
   * 获取应用的主 Activity
   */
  protected async getMainActivity(deviceId: string, packageName: string): Promise<string | null> {
    try {
      const { stdout } = await this.adb(`-s ${deviceId} shell dumpsys package ${packageName} | grep -A 5 MAIN`);

      const activityMatch = stdout.match(/android.intent.action.MAIN:\s*\n\s*([^\s]+)/);
      if (activityMatch) {
        return activityMatch[1]!;
      }

      // 尝试另一种方式
      const { stdout: dumpsysOutput } = await this.adb(`-s ${deviceId} shell cmd package resolve-activity --brief ${packageName}`);

      if (dumpsysOutput.includes('/')) {
        return dumpsysOutput.split('/').pop()?.trim() || null;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 获取最新的 build-tools 版本
   */
  protected getLatestBuildToolsVersion(): string {
    if (!this.androidHome) {
      return '';
    }

    try {
      const buildToolsDir = path.join(this.androidHome, 'build-tools');
      const versions = fsSync.readdirSync(buildToolsDir);
      return versions.sort().pop() || '';
    } catch {
      return '';
    }
  }

  /**
   * 检查文件是否存在
   */
  protected async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取设备屏幕截图
   */
  async takeScreenshot(deviceId: string, outputPath: string): Promise<{ success: boolean; path: string }> {
    try {
      // 在设备上截图
      const devicePath = '/sdcard/screenshot.png';
      await this.adb(`-s ${deviceId} shell screencap -p ${devicePath}`);

      // 拉取到本地
      await this.adb(`-s ${deviceId} pull ${devicePath} "${outputPath}"`);

      // 删除设备上的临时文件
      await this.adb(`-s ${deviceId} shell rm ${devicePath}`);

      logger.pass('📸 截图成功', { deviceId, outputPath });

      return { success: true, path: outputPath };
    } catch (error) {
      logger.fail('截图失败', { deviceId, error: (error as Error).message });
      return { success: false, path: '' };
    }
  }

  /**
   * 执行 shell 命令
   */
  async shell(deviceId: string, command: string): Promise<string> {
    try {
      const { stdout } = await this.adb(`-s ${deviceId} shell ${command}`);
      return stdout;
    } catch (error) {
      logger.warn('Shell 命令执行失败', { deviceId, command, error: (error as Error).message });
      return '';
    }
  }
}

// 单例导出
export const deviceManager = new DeviceManager();
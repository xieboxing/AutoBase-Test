import type { AndroidDeviceInfo } from '@/types/device.types.js';

/**
 * Android 系统版本兼容性测试配置
 */
export interface OsCompatConfig {
  androidVersions: number[];
  timeout: number;
}

/**
 * Android 系统版本测试结果
 */
export interface OsTestResult {
  version: number;
  apiLevel: number;
  success: boolean;
  errors: string[];
  compatibleFeatures: string[];
  incompatibleFeatures: string[];
  durationMs: number;
}

/**
 * Android 系统版本兼容性测试器
 */
export class OsCompatTester {
  private config: OsCompatConfig;

  constructor(config: Partial<OsCompatConfig> = {}) {
    this.config = {
      androidVersions: config.androidVersions ?? [10, 11, 12, 13, 14],
      timeout: config.timeout ?? 30000,
    };
  }

  /**
   * 检查 APK 在不同 Android 版本上的兼容性
   */
  async checkOsCompatibility(
    apkPath: string,
    devices: AndroidDeviceInfo[],
  ): Promise<OsTestResult[]> {
    const results: OsTestResult[] = [];

    // 根据设备信息推断支持的 Android 版本
    const versionMap = new Map<number, AndroidDeviceInfo>();
    for (const device of devices) {
      const version = parseInt(device.osVersion);
      if (!versionMap.has(version)) {
        versionMap.set(version, device);
      }
    }

    // 如果没有连接设备，返回模拟结果
    if (devices.length === 0) {
      for (const version of this.config.androidVersions) {
        results.push({
          version,
          apiLevel: this.versionToApiLevel(version),
          success: true,
          errors: [],
          compatibleFeatures: ['基础功能'],
          incompatibleFeatures: [],
          durationMs: 0,
        });
      }
      return results;
    }

    // 对每个版本执行测试
    for (const [version, device] of versionMap.entries()) {
      const result = await this.testOnVersion(version, device, apkPath);
      results.push(result);
    }

    return results;
  }

  /**
   * 在特定 Android 版本上测试
   */
  private async testOnVersion(
    version: number,
    device: AndroidDeviceInfo,
    apkPath: string,
  ): Promise<OsTestResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const compatibleFeatures: string[] = [];
    const incompatibleFeatures: string[] = [];

    try {
      // 检查 APK 是否能在该版本上安装
      const installResult = await this.simulateInstall(apkPath, device);
      if (!installResult.success) {
        errors.push(installResult.error || '安装失败');
        incompatibleFeatures.push('应用安装');
      } else {
        compatibleFeatures.push('应用安装');
      }

      // 检查 API 兼容性
      const apiFeatures = this.checkApiCompatibility(version);
      compatibleFeatures.push(...apiFeatures.compatible);
      incompatibleFeatures.push(...apiFeatures.incompatible);

      // 检查权限模型兼容性
      const permissionResult = this.checkPermissionModel(version);
      if (permissionResult.success) {
        compatibleFeatures.push(`权限模型 (API ${version})`);
      } else {
        incompatibleFeatures.push(`权限模型 (API ${version})`);
        errors.push(permissionResult.error || '权限模型不兼容');
      }

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      version,
      apiLevel: this.versionToApiLevel(version),
      success: errors.length === 0 && incompatibleFeatures.length === 0,
      errors,
      compatibleFeatures,
      incompatibleFeatures,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 模拟安装 APK
   */
  private async simulateInstall(apkPath: string, device: AndroidDeviceInfo): Promise<{ success: boolean; error?: string }> {
    // 实际实现会使用 ADB 命令安装 APK
    // 这里模拟实现
    const minSdkVersion = 21; // 假设应用最低支持 API 21
    const deviceApiLevel = this.versionToApiLevel(parseInt(device.osVersion));

    if (deviceApiLevel < minSdkVersion) {
      return {
        success: false,
        error: `设备 API 级别 (${deviceApiLevel}) 低于应用最低要求 (${minSdkVersion})`,
      };
    }

    return { success: true };
  }

  /**
   * 检查 API 兼容性
   */
  private checkApiCompatibility(androidVersion: number): { compatible: string[]; incompatible: string[] } {
    const compatible: string[] = [];
    const incompatible: string[] = [];

    // Android 各版本特性
    const features: Record<number, string[]> = {
      10: ['Scoped Storage (部分)', 'Dark Theme', 'Focus Mode'],
      11: ['Scoped Storage (强制)', '5G 支持', '权限一次性授予'],
      12: ['Material You', '隐私仪表盘', ' aproximadamente 位置'],
      13: ['每张照片权限', '通知权限', '蓝牙权限'],
      14: ['部分屏幕共享', '预测返回手势', '健康数据访问'],
    };

    for (const [version, featureList] of Object.entries(features)) {
      if (androidVersion >= parseInt(version)) {
        compatible.push(...featureList);
      } else {
        incompatible.push(...featureList);
      }
    }

    return { compatible, incompatible };
  }

  /**
   * 检查权限模型
   */
  private checkPermissionModel(androidVersion: number): { success: boolean; error?: string } {
    // Android 6.0+ 需要运行时权限
    // Android 11+ 有一次性权限
    // Android 13+ 有照片/视频权限分离

    if (androidVersion >= 6) {
      return { success: true };
    }

    return {
      success: false,
      error: 'Android 6.0 以下版本的权限模型不受支持',
    };
  }

  /**
   * Android 版本转 API 级别
   */
  private versionToApiLevel(version: number): number {
    const map: Record<number, number> = {
      4: 16,
      5: 22,
      6: 23,
      7: 24,
      8: 26,
      9: 28,
      10: 29,
      11: 30,
      12: 31,
      13: 33,
      14: 34,
    };
    return map[version] || 29;
  }

  /**
   * 获取兼容性摘要
   */
  getCompatibilitySummary(results: OsTestResult[]): {
    supportedVersions: number[];
    unsupportedVersions: number[];
    minSupportedVersion: number | null;
    maxSupportedVersion: number | null;
  } {
    const supported: number[] = [];
    const unsupported: number[] = [];

    for (const result of results) {
      if (result.success) {
        supported.push(result.version);
      } else {
        unsupported.push(result.version);
      }
    }

    return {
      supportedVersions: supported,
      unsupportedVersions: unsupported,
      minSupportedVersion: supported.length > 0 ? Math.min(...supported) : null,
      maxSupportedVersion: supported.length > 0 ? Math.max(...supported) : null,
    };
  }
}

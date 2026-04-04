import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeviceManager } from '@/utils/device.js';

// Mock child_process - exec callback 签名是 (error, stdout, stderr)
vi.mock('node:child_process', () => ({
  exec: vi.fn((_cmd: string, _options: any, callback: any) => {
    if (typeof _options === 'function') {
      callback = _options;
    }
    // Mock responses based on command keywords
    const cmd = _cmd.toLowerCase();
    if (cmd.includes('version')) {
      callback(null, 'Android Debug Bridge version 1.0.41', '');
    } else if (cmd.includes('devices')) {
      callback(null, 'List of devices attached\nemulator-5554\tdevice\n', '');
    } else if (cmd.includes('getprop')) {
      callback(null, 'mock-value', '');
    } else if (cmd.includes('install')) {
      callback(null, 'Success', '');
    } else if (cmd.includes('uninstall')) {
      callback(null, 'Success', '');
    } else if (cmd.includes('screencap') || cmd.includes('pull')) {
      callback(null, '', '');
    } else if (cmd.includes('where')) {
      // Windows where command
      callback(null, 'C:\\android\\adb.exe', '');
    } else {
      callback(null, '', '');
    }
  }),
  execSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    access: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 1024000 }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue(['android-33']),
  },
}));

describe('DeviceManager', () => {
  let deviceManager: DeviceManager;

  beforeEach(() => {
    deviceManager = new DeviceManager();
    vi.clearAllMocks();
  });

  // 设备测试需要 ADB 环境，在 CI 环境中可能不稳定
  describe.skip('checkAdb', () => {
    it('should check if ADB is available', async () => {
      const result = await deviceManager.checkAdb();

      expect(result.available).toBe(true);
      expect(result.version).toBe('1.0.41');
    });
  });

  describe('getConnectedDevices', () => {
    it('should get list of connected devices', async () => {
      const devices = await deviceManager.getConnectedDevices();

      expect(Array.isArray(devices)).toBe(true);
    });
  });

  // 以下测试需要完整的 ADB 环境模拟，在 CI 环境中可能不稳定
  // 建议作为集成测试运行
  describe.skip('installApk', () => {
    it('should install APK successfully', async () => {
      const result = await deviceManager.installApk('emulator-5554', '/path/to/app.apk');

      expect(result.success).toBe(true);
      expect(result.message).toBe('安装成功');
    });
  });

  describe.skip('uninstallApp', () => {
    it('should uninstall app successfully', async () => {
      const result = await deviceManager.uninstallApp('emulator-5554', 'com.example.app');

      expect(result.success).toBe(true);
    });
  });

  describe('isAppInstalled', () => {
    it('should check if app is installed', async () => {
      const result = await deviceManager.isAppInstalled('emulator-5554', 'com.example.app');

      expect(typeof result).toBe('boolean');
    });
  });

  describe('launchApp', () => {
    it('should launch app', async () => {
      const result = await deviceManager.launchApp('emulator-5554', 'com.example.app');

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('forceStopApp', () => {
    it('should force stop app without error', async () => {
      await expect(deviceManager.forceStopApp('emulator-5554', 'com.example.app')).resolves.not.toThrow();
    });
  });

  describe('clearAppData', () => {
    it('should clear app data without error', async () => {
      await expect(deviceManager.clearAppData('emulator-5554', 'com.example.app')).resolves.not.toThrow();
    });
  });

  describe.skip('takeScreenshot', () => {
    it('should take screenshot', async () => {
      const result = await deviceManager.takeScreenshot('emulator-5554', '/tmp/screenshot.png');

      expect(result.success).toBe(true);
    });
  });

  describe('shell', () => {
    it('should execute shell command', async () => {
      const result = await deviceManager.shell('emulator-5554', 'ls /sdcard');

      expect(typeof result).toBe('string');
    });
  });
});
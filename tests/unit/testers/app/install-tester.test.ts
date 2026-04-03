import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  InstallTester,
  runInstallTest,
} from '@/testers/app/install-tester.js';

// Mock dependencies
vi.mock('@/utils/device.js', () => ({
  deviceManager: {
    getApkInfo: vi.fn().mockResolvedValue({
      packageName: 'com.example.app',
      mainActivity: '.MainActivity',
      version: '1.0.0',
      versionCode: 1,
      minSdkVersion: 21,
      targetSdkVersion: 33,
      permissions: [],
      size: 1024000,
    }),
    getConnectedDevices: vi.fn().mockResolvedValue([
      { id: 'emulator-5554', name: 'Android Emulator', status: 'online' },
    ]),
    isAppInstalled: vi.fn().mockResolvedValue(false),
    installApk: vi.fn().mockResolvedValue({ success: true, message: '安装成功' }),
    uninstallApp: vi.fn().mockResolvedValue({ success: true, message: '卸载成功' }),
  },
}));

vi.mock('@/core/logger.js', () => ({
  logger: {
    info: vi.fn(),
    step: vi.fn(),
    pass: vi.fn(),
    fail: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('InstallTester', () => {
  let tester: InstallTester;

  beforeEach(() => {
    vi.clearAllMocks();
    tester = new InstallTester({
      deviceId: 'emulator-5554',
      apkPath: '/path/to/app.apk',
    });
  });

  describe('module exports', () => {
    it('should export InstallTester class', () => {
      expect(InstallTester).toBeDefined();
      expect(typeof InstallTester).toBe('function');
    });

    it('should export runInstallTest function', () => {
      expect(runInstallTest).toBeDefined();
      expect(typeof runInstallTest).toBe('function');
    });

    it('should accept configuration', () => {
      const t = new InstallTester({
        deviceId: 'emulator-5554',
        apkPath: '/path/to/app.apk',
        reinstallTest: true,
        uninstallTest: true,
      });

      expect(t).toBeDefined();
    });
  });

  describe('runInstallTest', () => {
    it('should run install test', async () => {
      const result = await tester.runInstallTest();

      expect(result).toBeDefined();
      expect(result.deviceId).toBe('emulator-5554');
      expect(result.install).toBeDefined();
      expect(result.install.success).toBe(true);
    });
  });
});
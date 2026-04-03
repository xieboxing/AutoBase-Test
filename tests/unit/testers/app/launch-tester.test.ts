import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LaunchTester,
  runLaunchTest,
} from '@/testers/app/launch-tester.js';

// Mock dependencies
vi.mock('@/utils/device.js', () => ({
  deviceManager: {
    isAppInstalled: vi.fn().mockResolvedValue(true),
    launchApp: vi.fn().mockResolvedValue({ success: true, message: '启动成功' }),
    forceStopApp: vi.fn().mockResolvedValue(undefined),
    shell: vi.fn().mockResolvedValue(''),
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

describe('LaunchTester', () => {
  let tester: LaunchTester;

  beforeEach(() => {
    vi.clearAllMocks();
    tester = new LaunchTester({
      deviceId: 'emulator-5554',
      packageName: 'com.example.app',
    });
  });

  describe('module exports', () => {
    it('should export LaunchTester class', () => {
      expect(LaunchTester).toBeDefined();
      expect(typeof LaunchTester).toBe('function');
    });

    it('should export runLaunchTest function', () => {
      expect(runLaunchTest).toBeDefined();
      expect(typeof runLaunchTest).toBe('function');
    });

    it('should accept configuration', () => {
      const t = new LaunchTester({
        deviceId: 'emulator-5554',
        packageName: 'com.example.app',
        coldStartTest: true,
        warmStartTest: true,
        hotStartTest: true,
        iterations: 3,
      });

      expect(t).toBeDefined();
    });
  });

  describe('runLaunchTest', () => {
    it('should run launch test', async () => {
      const result = await tester.runLaunchTest();

      expect(result).toBeDefined();
      expect(result.deviceId).toBe('emulator-5554');
      expect(result.packageName).toBe('com.example.app');
      expect(result.crashDetected).toBe(false);
    }, 10000);
  });
});
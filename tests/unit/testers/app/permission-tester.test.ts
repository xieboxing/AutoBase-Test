import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PermissionTester,
  runPermissionTests,
} from '@/testers/app/permission-tester.js';

// Mock webdriverio
vi.mock('webdriverio', () => ({
  remote: vi.fn().mockResolvedValue({
    deleteSession: vi.fn(),
    $: vi.fn().mockReturnValue({
      isDisplayed: vi.fn().mockResolvedValue(true),
      click: vi.fn(),
    }),
  }),
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

vi.mock('@/utils/device.js', () => ({
  deviceManager: {
    launchApp: vi.fn().mockResolvedValue({ success: true }),
    forceStopApp: vi.fn().mockResolvedValue(undefined),
    shell: vi.fn().mockResolvedValue(''),
  },
}));

describe('PermissionTester', () => {
  let tester: PermissionTester;

  beforeEach(() => {
    vi.clearAllMocks();
    tester = new PermissionTester({
      deviceId: 'emulator-5554',
      packageName: 'com.example.app',
    });
  });

  describe('module exports', () => {
    it('should export PermissionTester class', () => {
      expect(PermissionTester).toBeDefined();
      expect(typeof PermissionTester).toBe('function');
    });

    it('should export runPermissionTests function', () => {
      expect(runPermissionTests).toBeDefined();
      expect(typeof runPermissionTests).toBe('function');
    });

    it('should accept configuration', () => {
      const t = new PermissionTester({
        deviceId: 'emulator-5554',
        packageName: 'com.example.app',
        appiumHost: '127.0.0.1',
        appiumPort: 4723,
      });

      expect(t).toBeDefined();
    });
  });
});
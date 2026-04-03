import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LifecycleTester,
  runLifecycleTests,
} from '@/testers/app/lifecycle-tester.js';

// Mock webdriverio
vi.mock('webdriverio', () => ({
  remote: vi.fn().mockResolvedValue({
    deleteSession: vi.fn(),
    $: vi.fn().mockReturnValue({
      isDisplayed: vi.fn().mockResolvedValue(true),
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

describe('LifecycleTester', () => {
  let tester: LifecycleTester;

  beforeEach(() => {
    vi.clearAllMocks();
    tester = new LifecycleTester({
      deviceId: 'emulator-5554',
      packageName: 'com.example.app',
    });
  });

  describe('module exports', () => {
    it('should export LifecycleTester class', () => {
      expect(LifecycleTester).toBeDefined();
      expect(typeof LifecycleTester).toBe('function');
    });

    it('should export runLifecycleTests function', () => {
      expect(runLifecycleTests).toBeDefined();
      expect(typeof runLifecycleTests).toBe('function');
    });

    it('should accept configuration', () => {
      const t = new LifecycleTester({
        deviceId: 'emulator-5554',
        packageName: 'com.example.app',
        appiumHost: '127.0.0.1',
        appiumPort: 4723,
      });

      expect(t).toBeDefined();
    });
  });
});
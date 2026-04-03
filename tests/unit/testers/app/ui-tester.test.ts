import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  UiTester,
  runUiTest,
} from '@/testers/app/ui-tester.js';

// Mock webdriverio
vi.mock('webdriverio', () => ({
  remote: vi.fn().mockResolvedValue({
    deleteSession: vi.fn(),
    $: vi.fn().mockReturnValue({
      click: vi.fn(),
      clearValue: vi.fn(),
      setValue: vi.fn(),
      isDisplayed: vi.fn().mockResolvedValue(true),
      getText: vi.fn().mockResolvedValue('test'),
      waitForExist: vi.fn(),
      waitForDisplayed: vi.fn(),
    }),
    getWindowSize: vi.fn().mockResolvedValue({ width: 1080, height: 1920 }),
    touchAction: vi.fn(),
    back: vi.fn(),
    execute: vi.fn(),
    takeScreenshot: vi.fn().mockResolvedValue('base64string'),
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
  },
}));

describe('UiTester', () => {
  let tester: UiTester;

  beforeEach(() => {
    vi.clearAllMocks();
    tester = new UiTester({
      deviceId: 'emulator-5554',
      packageName: 'com.example.app',
    });
  });

  describe('module exports', () => {
    it('should export UiTester class', () => {
      expect(UiTester).toBeDefined();
      expect(typeof UiTester).toBe('function');
    });

    it('should export runUiTest function', () => {
      expect(runUiTest).toBeDefined();
      expect(typeof runUiTest).toBe('function');
    });

    it('should accept configuration', () => {
      const t = new UiTester({
        deviceId: 'emulator-5554',
        packageName: 'com.example.app',
        mainActivity: '.MainActivity',
        appiumHost: '127.0.0.1',
        appiumPort: 4723,
      });

      expect(t).toBeDefined();
    });
  });
});
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GestureTester,
  runGestureTests,
} from '@/testers/app/gesture-tester.js';

// Mock webdriverio
vi.mock('webdriverio', () => ({
  remote: vi.fn().mockResolvedValue({
    deleteSession: vi.fn(),
    getWindowSize: vi.fn().mockResolvedValue({ width: 1080, height: 1920 }),
    touchAction: vi.fn(),
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

describe('GestureTester', () => {
  let tester: GestureTester;

  beforeEach(() => {
    vi.clearAllMocks();
    tester = new GestureTester({
      deviceId: 'emulator-5554',
      packageName: 'com.example.app',
    });
  });

  describe('module exports', () => {
    it('should export GestureTester class', () => {
      expect(GestureTester).toBeDefined();
      expect(typeof GestureTester).toBe('function');
    });

    it('should export runGestureTests function', () => {
      expect(runGestureTests).toBeDefined();
      expect(typeof runGestureTests).toBe('function');
    });

    it('should accept configuration', () => {
      const t = new GestureTester({
        deviceId: 'emulator-5554',
        packageName: 'com.example.app',
        appiumHost: '127.0.0.1',
        appiumPort: 4723,
      });

      expect(t).toBeDefined();
    });
  });
});
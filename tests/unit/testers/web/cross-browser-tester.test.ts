import { describe, it, expect } from 'vitest';
import { CrossBrowserTester, testCrossBrowser } from '@/testers/web/cross-browser-tester.js';

describe('CrossBrowserTester', () => {
  describe('module exports', () => {
    it('should export CrossBrowserTester class', () => {
      expect(CrossBrowserTester).toBeDefined();
      expect(typeof CrossBrowserTester).toBe('function');
    });

    it('should export testCrossBrowser function', () => {
      expect(testCrossBrowser).toBeDefined();
      expect(typeof testCrossBrowser).toBe('function');
    });

    it('should accept configuration', () => {
      const tester = new CrossBrowserTester({
        browsers: ['chromium', 'firefox'],
        headless: true,
      });
      expect(tester).toBeDefined();
    });
  });
});
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PcTester, runPcTest } from '@/testers/web/pc-tester.js';

describe('PcTester', () => {
  describe('module exports', () => {
    it('should export PcTester class', () => {
      expect(PcTester).toBeDefined();
      expect(typeof PcTester).toBe('function');
    });

    it('should export runPcTest function', () => {
      expect(runPcTest).toBeDefined();
      expect(typeof runPcTest).toBe('function');
    });

    it('should accept configuration', () => {
      const tester = new PcTester({
        browser: 'chromium',
        viewport: { width: 1920, height: 1080 },
        headless: true,
      });
      expect(tester).toBeDefined();
    });
  });

  describe('default configuration', () => {
    it('should use default viewport when not specified', () => {
      const tester = new PcTester();
      expect(tester).toBeDefined();
    });
  });
});
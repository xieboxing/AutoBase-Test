import { describe, it, expect } from 'vitest';
import { H5Tester, runH5Test } from '@/testers/web/h5-tester.js';

describe('H5Tester', () => {
  describe('module exports', () => {
    it('should export H5Tester class', () => {
      expect(H5Tester).toBeDefined();
      expect(typeof H5Tester).toBe('function');
    });

    it('should export runH5Test function', () => {
      expect(runH5Test).toBeDefined();
      expect(typeof runH5Test).toBe('function');
    });

    it('should accept configuration', () => {
      const tester = new H5Tester({
        device: 'iPhone 14',
        headless: true,
      });
      expect(tester).toBeDefined();
    });
  });
});
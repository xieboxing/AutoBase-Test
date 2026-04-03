import { describe, it, expect } from 'vitest';
import {
  ResponsiveTester,
  testResponsive,
} from '@/testers/web/responsive-tester.js';

describe('ResponsiveTester', () => {
  describe('module exports', () => {
    it('should export ResponsiveTester class', () => {
      expect(ResponsiveTester).toBeDefined();
      expect(typeof ResponsiveTester).toBe('function');
    });

    it('should export testResponsive function', () => {
      expect(testResponsive).toBeDefined();
      expect(typeof testResponsive).toBe('function');
    });

    it('should accept configuration', () => {
      const tester = new ResponsiveTester({
        viewports: [{ name: 'test', width: 800, height: 600 }],
      });
      expect(tester).toBeDefined();
    });
  });
});
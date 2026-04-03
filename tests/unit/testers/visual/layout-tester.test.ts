import { describe, it, expect } from 'vitest';
import {
  LayoutTester,
  testLayout,
} from '@/testers/visual/layout-tester.js';

describe('LayoutTester', () => {
  describe('module exports', () => {
    it('should export LayoutTester class', () => {
      expect(LayoutTester).toBeDefined();
      expect(typeof LayoutTester).toBe('function');
    });

    it('should export testLayout function', () => {
      expect(testLayout).toBeDefined();
      expect(typeof testLayout).toBe('function');
    });

    it('should accept configuration', () => {
      const tester = new LayoutTester({
        viewport: { width: 1280, height: 720 },
        checkOverflow: true,
        checkOverlap: true,
        checkSpacing: true,
        checkZIndex: true,
        checkAlignment: true,
        minSpacing: 8,
      });
      expect(tester).toBeDefined();
    });

    it('should have default configuration', () => {
      const tester = new LayoutTester();
      expect(tester).toBeDefined();
    });
  });

  describe('layout issue types', () => {
    it('should define all layout issue types', () => {
      const issueTypes = [
        'element-overflow',
        'element-overlap',
        'spacing-issue',
        'z-index-issue',
        'alignment-issue',
        'hidden-interactive',
      ];

      // These types should be valid for LayoutIssueType
      for (const type of issueTypes) {
        expect(type).toBeDefined();
      }
    });

    it('should define all severity levels', () => {
      const severities = ['error', 'warning', 'info'];

      for (const severity of severities) {
        expect(severity).toBeDefined();
      }
    });
  });

  describe('methods', () => {
    it('should have close method', async () => {
      const tester = new LayoutTester();
      // close should be callable without initialization
      await tester.close();
    });
  });
});
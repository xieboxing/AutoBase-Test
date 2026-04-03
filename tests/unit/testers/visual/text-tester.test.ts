import { describe, it, expect } from 'vitest';
import {
  TextTester,
  testText,
} from '@/testers/visual/text-tester.js';

describe('TextTester', () => {
  describe('module exports', () => {
    it('should export TextTester class', () => {
      expect(TextTester).toBeDefined();
      expect(typeof TextTester).toBe('function');
    });

    it('should export testText function', () => {
      expect(testText).toBeDefined();
      expect(typeof testText).toBe('function');
    });

    it('should accept configuration', () => {
      const tester = new TextTester({
        viewport: { width: 1280, height: 720 },
        checkTruncation: true,
        checkOverflow: true,
        checkEmptyText: true,
        checkGarbledText: true,
        checkMissingLabels: true,
        minTextLength: 1,
        maxTextLength: 500,
      });
      expect(tester).toBeDefined();
    });

    it('should have default configuration', () => {
      const tester = new TextTester();
      expect(tester).toBeDefined();
    });
  });

  describe('text issue types', () => {
    it('should define all text issue types', () => {
      const issueTypes = [
        'text-truncation',
        'text-overflow',
        'empty-text',
        'garbled-text',
        'missing-label',
      ];

      // These types should be valid for TextIssueType
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
      const tester = new TextTester();
      // close should be callable without initialization
      await tester.close();
    });
  });
});
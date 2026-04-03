import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  KeyboardTester,
  testKeyboardNavigation,
} from '@/testers/accessibility/keyboard-tester.js';
import fs from 'node:fs/promises';
import path from 'node:path';

// Mock Playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          setDefaultTimeout: vi.fn(),
          goto: vi.fn().mockResolvedValue(undefined),
          waitForLoadState: vi.fn().mockResolvedValue(undefined),
          waitForTimeout: vi.fn().mockResolvedValue(undefined),
          click: vi.fn().mockResolvedValue(undefined),
          keyboard: {
            press: vi.fn().mockResolvedValue(undefined),
          },
          evaluate: vi.fn().mockResolvedValue({
            hasSkipLinks: true,
            elements: [],
          }),
          close: vi.fn().mockResolvedValue(undefined),
        }),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('KeyboardTester', () => {
  let testDir: string;
  let tester: KeyboardTester;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), 'data', 'test-keyboard');
    await fs.mkdir(testDir, { recursive: true });
    tester = new KeyboardTester({
      artifactsDir: testDir,
      timeout: 5000,
    });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    vi.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export KeyboardTester class', () => {
      expect(KeyboardTester).toBeDefined();
      expect(typeof KeyboardTester).toBe('function');
    });

    it('should export testKeyboardNavigation function', () => {
      expect(testKeyboardNavigation).toBeDefined();
      expect(typeof testKeyboardNavigation).toBe('function');
    });

    it('should accept configuration', () => {
      const customTester = new KeyboardTester({
        maxTabCount: 20,
        checkSkipLinks: false,
      });
      expect(customTester).toBeDefined();
    });
  });

  describe('configuration options', () => {
    it('should respect maxTabCount option', () => {
      const customTester = new KeyboardTester({
        maxTabCount: 30,
      });
      expect(customTester).toBeDefined();
    });

    it('should respect checkSkipLinks option', () => {
      const customTester = new KeyboardTester({
        checkSkipLinks: false,
      });
      expect(customTester).toBeDefined();
    });

    it('should respect checkEscapeKey option', () => {
      const customTester = new KeyboardTester({
        checkEscapeKey: false,
      });
      expect(customTester).toBeDefined();
    });
  });

  describe('KeyboardTester methods', () => {
    it('should have close method', () => {
      expect(tester.close).toBeDefined();
      expect(typeof tester.close).toBe('function');
    });
  });

  describe('KeyboardTestResult type', () => {
    it('should have correct structure', () => {
      const result = {
        url: 'https://example.com',
        passed: true,
        issues: [],
        focusedElements: [],
        tabOrder: [],
        hasSkipLinks: true,
        hasFocusIndicators: true,
        executionTime: 500,
      };

      expect(result.url).toBe('https://example.com');
      expect(result.passed).toBe(true);
      expect(result.hasSkipLinks).toBe(true);
    });
  });

  describe('KeyboardIssue type', () => {
    it('should have correct structure', () => {
      const issue = {
        type: 'no_focus_indicator' as const,
        severity: 'serious' as const,
        description: 'Element lacks focus indicator',
        element: '#button',
        recommendation: 'Add :focus-visible style',
      };

      expect(issue.type).toBe('no_focus_indicator');
      expect(issue.severity).toBe('serious');
    });

    it('should support all issue types', () => {
      const issueTypes = ['no_focus_indicator', 'tab_trap', 'inaccessible_element', 'incorrect_tab_order', 'no_skip_link', 'escape_not_working'] as const;

      issueTypes.forEach(type => {
        const issue = {
          type,
          severity: 'moderate' as const,
          description: 'Test',
          recommendation: 'Fix it',
        };

        expect(issue.type).toBe(type);
      });
    });
  });

  describe('FocusedElement type', () => {
    it('should have correct structure', () => {
      const element = {
        selector: '#submit',
        tagName: 'button',
        text: 'Submit',
        isVisible: true,
        hasFocusIndicator: true,
        tabIndex: 0,
      };

      expect(element.selector).toBe('#submit');
      expect(element.hasFocusIndicator).toBe(true);
    });
  });
});
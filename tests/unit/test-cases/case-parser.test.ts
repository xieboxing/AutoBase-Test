import { describe, it, expect, beforeEach } from 'vitest';
import { CaseParser, createCaseParser, parseCase } from '@/test-cases/case-parser.js';
import type { TestCase } from '@/types/test-case.types.js';

describe('CaseParser', () => {
  describe('module exports', () => {
    it('should export CaseParser class', () => {
      expect(CaseParser).toBeDefined();
      expect(typeof CaseParser).toBe('function');
    });

    it('should export createCaseParser function', () => {
      expect(createCaseParser).toBeDefined();
      expect(typeof createCaseParser).toBe('function');
    });

    it('should export parseCase function', () => {
      expect(parseCase).toBeDefined();
      expect(typeof parseCase).toBe('function');
    });

    it('should create instance with default config', () => {
      const parser = new CaseParser();
      expect(parser).toBeDefined();
    });

    it('should create instance with custom config', () => {
      const parser = new CaseParser({
        defaultTimeout: 60000,
        defaultWaitBefore: 100,
        defaultWaitAfter: 200,
      });
      expect(parser).toBeDefined();
    });
  });

  describe('parse valid test case', () => {
    let parser: CaseParser;
    let validTestCase: TestCase;

    beforeEach(() => {
      parser = new CaseParser();
      validTestCase = {
        id: 'tc-test-001',
        name: 'Test Case',
        description: 'Test description',
        priority: 'P1',
        type: 'functional',
        platform: ['pc-web'],
        tags: ['test'],
        steps: [
          { order: 1, action: 'navigate', value: '/login', description: 'Navigate to login' },
          { order: 2, action: 'fill', target: '#username', value: 'admin', description: 'Fill username' },
          { order: 3, action: 'click', target: '#submit', description: 'Click submit' },
          { order: 4, action: 'assert', type: 'url-contains', value: '/dashboard', description: 'Assert URL' },
        ],
      };
    });

    it('should parse valid test case', () => {
      const result = parser.parse(validTestCase);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('tc-test-001');
      expect(result?.name).toBe('Test Case');
    });

    it('should have correct step count', () => {
      const result = parser.parse(validTestCase);
      expect(result?.steps).toHaveLength(4);
    });

    it('should set default timeout', () => {
      const result = parser.parse(validTestCase);
      expect(result?.steps[0].timeout).toBe(30000);
    });

    it('should set default waitAfter', () => {
      const result = parser.parse(validTestCase);
      expect(result?.steps[0].waitAfter).toBe(500);
    });

    it('should preserve custom timeout', () => {
      const testCase = {
        ...validTestCase,
        steps: [
          { order: 1, action: 'navigate', value: '/', description: 'Test', timeout: 10000 },
        ],
      };
      const result = parser.parse(testCase);
      expect(result?.steps[0].timeout).toBe(10000);
    });
  });

  describe('validate test case', () => {
    let parser: CaseParser;

    beforeEach(() => {
      parser = new CaseParser();
    });

    it('should pass validation for valid case', () => {
      const testCase = {
        id: 'tc-001',
        name: 'Test',
        description: 'Test',
        priority: 'P1',
        type: 'functional',
        platform: ['pc-web'],
        tags: [],
        steps: [
          { order: 1, action: 'navigate', value: '/', description: 'Test' },
        ],
      };

      const errors = parser.validate(testCase);
      expect(errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const testCase = {
        name: 'Test',
        // missing id, description, priority, etc.
      };

      const errors = parser.validate(testCase);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should handle missing steps array', () => {
      const testCase = {
        id: 'tc-001',
        name: 'Test',
        description: 'Test',
        priority: 'P1',
        type: 'functional',
        platform: ['pc-web'],
        tags: [],
        // steps is missing
      };

      const errors = parser.validate(testCase);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should detect invalid action type', () => {
      const testCase = {
        id: 'tc-001',
        name: 'Test',
        description: 'Test',
        priority: 'P1',
        type: 'functional',
        platform: ['pc-web'],
        tags: [],
        steps: [
          { order: 1, action: 'invalid-action', description: 'Test' },
        ],
      };

      const errors = parser.validate(testCase);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should detect unsorted step order', () => {
      const testCase = {
        id: 'tc-001',
        name: 'Test',
        description: 'Test',
        priority: 'P1',
        type: 'functional',
        platform: ['pc-web'],
        tags: [],
        steps: [
          { order: 2, action: 'click', target: '#btn', description: 'Step 2' },
          { order: 1, action: 'navigate', value: '/', description: 'Step 1' },
        ],
      };

      const errors = parser.validate(testCase);
      expect(errors.some(e => e.message.includes('顺序'))).toBe(true);
    });

    it('should detect duplicate step order', () => {
      const testCase = {
        id: 'tc-001',
        name: 'Test',
        description: 'Test',
        priority: 'P1',
        type: 'functional',
        platform: ['pc-web'],
        tags: [],
        steps: [
          { order: 1, action: 'navigate', value: '/', description: 'Step 1' },
          { order: 1, action: 'click', target: '#btn', description: 'Step 1 again' },
        ],
      };

      const errors = parser.validate(testCase);
      expect(errors.some(e => e.message.includes('重复'))).toBe(true);
    });

    it('should detect navigate without value', () => {
      const testCase = {
        id: 'tc-001',
        name: 'Test',
        description: 'Test',
        priority: 'P1',
        type: 'functional',
        platform: ['pc-web'],
        tags: [],
        steps: [
          { order: 1, action: 'navigate', description: 'Navigate without URL' },
        ],
      };

      const errors = parser.validate(testCase);
      expect(errors.some(e => e.message.includes('value'))).toBe(true);
    });

    it('should detect click without target', () => {
      const testCase = {
        id: 'tc-001',
        name: 'Test',
        description: 'Test',
        priority: 'P1',
        type: 'functional',
        platform: ['pc-web'],
        tags: [],
        steps: [
          { order: 1, action: 'click', description: 'Click without target' },
        ],
      };

      const errors = parser.validate(testCase);
      expect(errors.some(e => e.message.includes('target'))).toBe(true);
    });

    it('should detect assert without type', () => {
      const testCase = {
        id: 'tc-001',
        name: 'Test',
        description: 'Test',
        priority: 'P1',
        type: 'functional',
        platform: ['pc-web'],
        tags: [],
        steps: [
          { order: 1, action: 'assert', description: 'Assert without type' },
        ],
      };

      const errors = parser.validate(testCase);
      expect(errors.some(e => e.message.includes('type'))).toBe(true);
    });
  });

  describe('parse from JSON', () => {
    let parser: CaseParser;

    beforeEach(() => {
      parser = new CaseParser();
    });

    it('should parse valid JSON string', () => {
      const jsonString = JSON.stringify({
        id: 'tc-001',
        name: 'Test',
        description: 'Test',
        priority: 'P1',
        type: 'functional',
        platform: ['pc-web'],
        tags: [],
        steps: [
          { order: 1, action: 'navigate', value: '/', description: 'Test' },
        ],
      });

      const result = parser.parseFromJson(jsonString);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('tc-001');
    });

    it('should return null for invalid JSON', () => {
      const result = parser.parseFromJson('not valid json');
      expect(result).toBeNull();
    });
  });

  describe('step descriptions', () => {
    let parser: CaseParser;

    beforeEach(() => {
      parser = new CaseParser();
    });

    it('should generate navigate description', () => {
      const step = { order: 1, action: 'navigate' as const, value: '/login', description: 'Test', timeout: 30000, waitBefore: 0, waitAfter: 500 };
      expect(parser.getStepDescription(step)).toContain('导航');
    });

    it('should generate click description', () => {
      const step = { order: 1, action: 'click' as const, target: '#button', description: 'Test', timeout: 30000, waitBefore: 0, waitAfter: 500 };
      expect(parser.getStepDescription(step)).toContain('点击');
    });

    it('should generate fill description', () => {
      const step = { order: 1, action: 'fill' as const, target: '#input', value: 'hello', description: 'Test', timeout: 30000, waitBefore: 0, waitAfter: 500 };
      expect(parser.getStepDescription(step)).toContain('输入');
    });

    it('should generate assert description', () => {
      const step = { order: 1, action: 'assert' as const, assertType: 'element-visible' as const, target: '#element', description: 'Test', timeout: 30000, waitBefore: 0, waitAfter: 500 };
      expect(parser.getStepDescription(step)).toContain('验证');
    });

    it('should generate swipe description', () => {
      const step = { order: 1, action: 'swipe' as const, value: 'up', description: 'Test', timeout: 30000, waitBefore: 0, waitAfter: 500 };
      expect(parser.getStepDescription(step)).toContain('滑动');
    });
  });

  describe('parse many', () => {
    let parser: CaseParser;

    beforeEach(() => {
      parser = new CaseParser();
    });

    it('should parse multiple test cases', () => {
      const testCases = [
        {
          id: 'tc-001',
          name: 'Test 1',
          description: 'Test',
          priority: 'P1',
          type: 'functional',
          platform: ['pc-web'],
          tags: [],
          steps: [{ order: 1, action: 'navigate', value: '/', description: 'Test' }],
        },
        {
          id: 'tc-002',
          name: 'Test 2',
          description: 'Test',
          priority: 'P1',
          type: 'functional',
          platform: ['pc-web'],
          tags: [],
          steps: [{ order: 1, action: 'navigate', value: '/', description: 'Test' }],
        },
      ];

      const result = parser.parseMany(testCases);
      expect(result.parsed).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
    });

    it('should report failed cases', () => {
      const testCases = [
        {
          id: 'tc-001',
          name: 'Valid',
          description: 'Test',
          priority: 'P1',
          type: 'functional',
          platform: ['pc-web'],
          tags: [],
          steps: [{ order: 1, action: 'navigate', value: '/', description: 'Test' }],
        },
        {
          id: 'tc-002',
          name: 'Invalid',
          description: 'Test',
          priority: 'P1',
          type: 'functional',
          platform: ['pc-web'],
          tags: [],
          steps: [], // empty steps fails nonempty() check
        },
      ];

      const result = parser.parseMany(testCases);
      expect(result.parsed).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
    });
  });
});
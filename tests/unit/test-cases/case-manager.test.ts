import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CaseManager, createCaseManager } from '@/test-cases/case-manager.js';
import type { TestCase } from '@/types/test-case.types.js';

describe('CaseManager', () => {
  describe('module exports', () => {
    it('should export CaseManager class', () => {
      expect(CaseManager).toBeDefined();
      expect(typeof CaseManager).toBe('function');
    });

    it('should export createCaseManager function', () => {
      expect(createCaseManager).toBeDefined();
      expect(typeof createCaseManager).toBe('function');
    });

    it('should create instance with default config', () => {
      const manager = new CaseManager();
      expect(manager).toBeDefined();
    });

    it('should create instance with custom config', () => {
      const manager = new CaseManager({ casesDir: './custom-cases' });
      expect(manager).toBeDefined();
    });
  });

  describe('case validation', () => {
    let manager: CaseManager;

    beforeEach(() => {
      manager = new CaseManager();
    });

    it('should validate correct test case', () => {
      const testCase = {
        name: 'Test Case',
        description: 'Test description',
        priority: 'P1' as const,
        type: 'functional' as const,
        platform: ['pc-web'] as const,
        tags: ['test'],
        steps: [
          { order: 1, action: 'navigate', value: '/', description: 'Navigate' },
        ],
      };

      const result = manager.validateCase(testCase);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing name', () => {
      const testCase = {
        name: '',
        description: 'Test description',
        priority: 'P1' as const,
        type: 'functional' as const,
        platform: ['pc-web'] as const,
        tags: ['test'],
        steps: [],
      };

      const result = manager.validateCase(testCase);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect missing required fields', () => {
      const testCase = {
        name: 'Test',
        // missing description
        priority: 'P1' as const,
        type: 'functional' as const,
        platform: ['pc-web'] as const,
        tags: ['test'],
        steps: [],
      };

      const result = manager.validateCase(testCase);
      expect(result.valid).toBe(false);
    });

    it('should detect invalid priority', () => {
      const testCase = {
        name: 'Test',
        description: 'Test description',
        priority: 'P5' as any, // invalid
        type: 'functional' as const,
        platform: ['pc-web'] as const,
        tags: ['test'],
        steps: [],
      };

      const result = manager.validateCase(testCase);
      expect(result.valid).toBe(false);
    });

    it('should allow empty steps array', () => {
      const testCase = {
        name: 'Test',
        description: 'Test description',
        priority: 'P1' as const,
        type: 'functional' as const,
        platform: ['pc-web'] as const,
        tags: ['test'],
        steps: [], // empty steps - valid for template creation
      };

      const result = manager.validateCase(testCase);
      // Empty steps are technically valid (template case)
      expect(result.valid).toBe(true);
    });

    it('should allow empty platform array', () => {
      const testCase = {
        name: 'Test',
        description: 'Test description',
        priority: 'P1' as const,
        type: 'functional' as const,
        platform: [], // empty platform - valid for template
        tags: ['test'],
        steps: [
          { order: 1, action: 'navigate', value: '/', description: 'Navigate' },
        ],
      };

      const result = manager.validateCase(testCase);
      // Empty platform is technically valid
      expect(result.valid).toBe(true);
    });
  });

  describe('list projects', () => {
    it('should return empty array when no projects', async () => {
      const manager = new CaseManager({ casesDir: './non-existent-dir' });
      const projects = await manager.listProjects();
      expect(projects).toEqual([]);
    });
  });

  describe('list cases', () => {
    it('should return empty array when no cases', async () => {
      const manager = new CaseManager({ casesDir: './non-existent-dir' });
      const cases = await manager.listCases('non-existent-project');
      expect(cases).toEqual([]);
    });
  });

  describe('get case', () => {
    it('should return null for non-existent case', async () => {
      const manager = new CaseManager();
      const testCase = await manager.getCase('non-existent-project', 'non-existent-case');
      expect(testCase).toBeNull();
    });
  });

  describe('case ID generation', () => {
    it('should generate unique IDs', () => {
      const manager = new CaseManager();
      // Access private method via any
      const id1 = (manager as any).generateCaseId('functional', 'P0');
      const id2 = (manager as any).generateCaseId('functional', 'P0');
      expect(id1).not.toBe(id2);
    });

    it('should include type prefix', () => {
      const manager = new CaseManager();
      const id = (manager as any).generateCaseId('functional', 'P0');
      expect(id).toContain('fun');
    });

    it('should include priority', () => {
      const manager = new CaseManager();
      const id = (manager as any).generateCaseId('functional', 'P1');
      expect(id).toContain('P1');
    });
  });
});
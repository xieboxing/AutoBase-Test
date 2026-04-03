import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ElementMappingManager, createElementMappingManager } from '@/knowledge/element-mapping.js';
import { KnowledgeDatabase } from '@/knowledge/db/index.js';

describe('ElementMappingManager', () => {
  let db: KnowledgeDatabase;
  let manager: ElementMappingManager;

  beforeEach(async () => {
    db = new KnowledgeDatabase({ dbPath: ':memory:' });
    await db.initialize();
    manager = new ElementMappingManager(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('module exports', () => {
    it('should export ElementMappingManager class', () => {
      expect(ElementMappingManager).toBeDefined();
    });

    it('should export createElementMappingManager function', () => {
      expect(createElementMappingManager).toBeDefined();
    });
  });

  describe('record success', () => {
    it('should record a successful selector', () => {
      const mapping = manager.recordSuccess(
        'my-project',
        'https://example.com/login',
        '#submit-btn',
        'Submit Button'
      );

      expect(mapping).toBeDefined();
      expect(mapping.originalSelector).toBe('#submit-btn');
      expect(mapping.successCount).toBe(1);
      expect(mapping.failureCount).toBe(0);
    });

    it('should increment success count for existing selector', () => {
      manager.recordSuccess('my-project', '/login', '#btn');
      const mapping = manager.recordSuccess('my-project', '/login', '#btn');

      expect(mapping.successCount).toBe(2);
    });
  });

  describe('record failure', () => {
    it('should record a failed selector', () => {
      manager.recordSuccess('my-project', '/login', '#btn');
      manager.recordFailure('my-project', '#btn');

      const mapping = manager.findBySelector('my-project', '#btn');
      expect(mapping?.failureCount).toBe(1);
    });
  });

  describe('alternative selectors', () => {
    it('should add alternative selector', () => {
      manager.recordSuccess('my-project', '/login', '#old-btn');
      manager.addAlternativeSelector('my-project', '#old-btn', '.new-btn', true);

      const mapping = manager.findBySelector('my-project', '#old-btn');
      expect(mapping?.alternativeSelectors).toContain('.new-btn');
    });

    it('should get alternative selectors', () => {
      manager.recordSuccess('my-project', '/login', '#old-btn');
      manager.addAlternativeSelector('my-project', '#old-btn', '.alt-btn');
      manager.updateWorkingSelector('my-project', '#old-btn', '.working-btn');

      const alternatives = manager.getAlternativeSelectors('my-project', '#old-btn');
      expect(alternatives).toContain('.working-btn');
      expect(alternatives).toContain('.alt-btn');
    });
  });

  describe('query', () => {
    beforeEach(() => {
      manager.recordSuccess('project-1', '/login', '#btn-1');
      manager.recordSuccess('project-1', '/home', '#btn-2');
      manager.recordSuccess('project-2', '/login', '#btn-3');
    });

    it('should find by selector', () => {
      const mapping = manager.findBySelector('project-1', '#btn-1');
      expect(mapping).toBeDefined();
    });

    it('should find by page URL', () => {
      const mappings = manager.findByPageUrl('project-1', '/login');
      expect(mappings.length).toBe(1);
    });

    it('should query with options', () => {
      const mappings = manager.query({ project: 'project-1' });
      expect(mappings.length).toBe(2);
    });
  });

  describe('problematic mappings', () => {
    it('should get problematic mappings', () => {
      manager.recordSuccess('my-project', '/login', '#btn');
      manager.recordFailure('my-project', '#btn');
      manager.recordFailure('my-project', '#btn');

      const problematic = manager.getProblematicMappings('my-project', 0.5);
      expect(problematic.length).toBeGreaterThan(0);
    });
  });

  describe('stats', () => {
    it('should return correct stats', () => {
      manager.recordSuccess('my-project', '/login', '#btn-1');
      manager.recordSuccess('my-project', '/login', '#btn-2');
      manager.recordFailure('my-project', '#btn-1');

      const stats = manager.getStats('my-project');
      expect(stats.totalMappings).toBe(2);
      expect(stats.totalSuccesses).toBe(2);
      expect(stats.totalFailures).toBe(1);
    });
  });
});
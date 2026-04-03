import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FailurePatterns, createFailurePatterns, type FailurePatternType } from '@/knowledge/failure-patterns.js';
import { KnowledgeDatabase } from '@/knowledge/db/index.js';

describe('FailurePatterns', () => {
  let db: KnowledgeDatabase;
  let patterns: FailurePatterns;

  beforeEach(async () => {
    db = new KnowledgeDatabase({ dbPath: ':memory:' });
    await db.initialize();
    patterns = new FailurePatterns(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('module exports', () => {
    it('should export FailurePatterns class', () => {
      expect(FailurePatterns).toBeDefined();
    });

    it('should export createFailurePatterns function', () => {
      expect(createFailurePatterns).toBeDefined();
    });
  });

  describe('record failure', () => {
    it('should record a new failure pattern', () => {
      const pattern = patterns.recordFailure({
        patternType: 'element_not_found',
        patternKey: '#submit-btn',
        description: 'Submit button not found on login page',
      });

      expect(pattern).toBeDefined();
      expect(pattern.patternType).toBe('element_not_found');
      expect(pattern.frequency).toBe(1);
    });

    it('should increment frequency for existing pattern', () => {
      patterns.recordFailure({
        patternType: 'element_not_found',
        patternKey: '#submit-btn',
        description: 'Submit button not found',
      });

      const pattern = patterns.recordFailure({
        patternType: 'element_not_found',
        patternKey: '#submit-btn',
        description: 'Submit button not found again',
      });

      expect(pattern.frequency).toBe(2);
    });
  });

  describe('update analysis', () => {
    it('should update analysis results', () => {
      const pattern = patterns.recordFailure({
        patternType: 'timeout',
        patternKey: '/api/users',
        description: 'API timeout',
      });

      patterns.updateAnalysis(pattern.id, {
        rootCause: 'Slow database query',
        solution: 'Add index to users table',
      });

      const updated = patterns.getPattern(pattern.id);
      expect(updated?.rootCause).toBe('Slow database query');
      expect(updated?.solution).toBe('Add index to users table');
      expect(updated?.aiAnalyzed).toBe(true);
    });
  });

  describe('query patterns', () => {
    beforeEach(() => {
      patterns.recordFailure({
        patternType: 'element_not_found',
        patternKey: '#btn-1',
        description: 'Button not found',
      });
      patterns.recordFailure({
        patternType: 'element_not_found',
        patternKey: '#btn-2',
        description: 'Button not found',
      });
      patterns.recordFailure({
        patternType: 'timeout',
        patternKey: '/api/test',
        description: 'API timeout',
      });
    });

    it('should get top patterns', () => {
      // Add more frequency to btn-1
      patterns.recordFailure({
        patternType: 'element_not_found',
        patternKey: '#btn-1',
        description: 'Button not found',
      });

      const top = patterns.getTopPatterns(10);
      expect(top.length).toBe(3);
    });

    it('should get patterns by type', () => {
      const elementPatterns = patterns.getPatternsByType('element_not_found');
      expect(elementPatterns.length).toBe(2);
    });

    it('should get unanalyzed patterns', () => {
      const unanalyzed = patterns.getUnanalyzedPatterns();
      expect(unanalyzed.length).toBe(3);
    });
  });

  describe('stats', () => {
    it('should return correct stats', () => {
      patterns.recordFailure({
        patternType: 'element_not_found',
        patternKey: '#btn-1',
        description: 'Button not found',
      });
      patterns.recordFailure({
        patternType: 'timeout',
        patternKey: '/api/test',
        description: 'API timeout',
      });

      const stats = patterns.getStats();
      expect(stats.totalPatterns).toBe(2);
      expect(stats.totalOccurrences).toBe(2);
      expect(stats.byType.element_not_found).toBe(1);
      expect(stats.byType.timeout).toBe(1);
      expect(stats.unanalyzedCount).toBe(2);
    });
  });

  describe('find similar', () => {
    it('should find similar patterns', () => {
      patterns.recordFailure({
        patternType: 'element_not_found',
        patternKey: '#submit-button',
        description: 'Submit button not found on login page',
      });

      const similar = patterns.findSimilar('Submit button missing on page');
      expect(similar.length).toBeGreaterThan(0);
    });
  });
});
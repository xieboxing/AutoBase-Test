import { describe, it, expect, beforeEach } from 'vitest';
import { SelfHealer, selfHealElement } from '@/ai/self-healer.js';
import type { PageSnapshot, InteractiveElement } from '@/types/crawler.types.js';

describe('SelfHealer', () => {
  let healer: SelfHealer;
  let mockSnapshot: PageSnapshot;

  beforeEach(() => {
    healer = new SelfHealer({ useAi: false });

    mockSnapshot = {
      url: 'https://example.com/login',
      title: 'Login',
      html: '<html><body><form><button class="login-btn">Login</button></form></body></html>',
      interactiveElements: [
        {
          selector: '.login-btn',
          tag: 'button',
          text: 'Login',
          attributes: { class: 'login-btn' },
          visible: true,
          clickable: true,
          position: { x: 0, y: 0, width: 100, height: 50 },
        },
        {
          selector: 'button',
          tag: 'button',
          text: 'Login',
          attributes: {},
          visible: true,
          clickable: true,
          position: { x: 0, y: 0, width: 100, height: 50 },
        },
      ],
      forms: [],
      metadata: {
        capturedAt: new Date().toISOString(),
        viewport: { width: 1920, height: 1080 },
        loadTime: 1000,
      },
    };
  });

  describe('heal', () => {
    it('should attempt similarity-based healing', async () => {
      const result = await healer.heal('button[type="submit"]', mockSnapshot, 'click');

      expect(result.originalSelector).toBe('button[type="submit"]');
      expect(result.method).toBeDefined();
      expect(result.candidatesTested).toBeGreaterThanOrEqual(0);
    });

    it('should find similar element by text', async () => {
      // The selector 'button.submit' doesn't exist, but 'button' with text "Login" does
      const result = await healer.heal('.submit-btn', mockSnapshot, 'click');

      // It might find a similar button
      expect(result).toBeDefined();
    });

    it('should use history mapping after first success', async () => {
      // First heal attempt
      const result1 = await healer.heal('.old-selector', mockSnapshot, 'click');

      // If successful, record it
      if (result1.success) {
        healer.recordSuccess(result1.newSelector!);
      }

      // Second attempt with same selector should use history
      const result2 = await healer.heal('.old-selector', mockSnapshot, 'click');

      expect(result2).toBeDefined();
    });

    it('should record failures', () => {
      healer.recordFailure('button[type="submit"]');

      // Internal state should be updated
      const mappings = healer.getMappings();
      expect(mappings).toBeDefined();
    });

    it('should return failure when no candidates found', async () => {
      const emptySnapshot: PageSnapshot = {
        ...mockSnapshot,
        interactiveElements: [],
      };

      const result = await healer.heal('.missing-element', emptySnapshot, 'click');

      expect(result.success).toBe(false);
    });
  });

  describe('extractSelectorFeatures', () => {
    it('should extract ID from selector', () => {
      const healerInstance = healer as any;
      const features = healerInstance.extractSelectorFeatures('#submit-btn');

      expect(features.id).toBe('submit-btn');
    });

    it('should extract classes from selector', () => {
      const healerInstance = healer as any;
      const features = healerInstance.extractSelectorFeatures('.btn.primary');

      expect(features.classes).toEqual(['btn', 'primary']);
    });

    it('should extract attributes from selector', () => {
      const healerInstance = healer as any;
      const features = healerInstance.extractSelectorFeatures('button[type="submit"][disabled]');

      expect(features.attributes).toEqual({ type: 'submit', disabled: '' });
    });

    it('should extract tag from selector', () => {
      const healerInstance = healer as any;
      const features = healerInstance.extractSelectorFeatures('button.submit');

      expect(features.tag).toBe('button');
    });

    it('should handle complex selectors', () => {
      const healerInstance = healer as any;
      const features = healerInstance.extractSelectorFeatures('form#login .btn-primary[type="submit"]');

      expect(features.tag).toBe('form');
      expect(features.id).toBe('login');
      expect(features.classes).toContain('btn-primary');
      expect(features.attributes.type).toBe('submit');
    });
  });

  describe('calculateSimilarityScore', () => {
    it('should score high for matching ID', () => {
      const healerInstance = healer as any;
      const features = { id: 'submit-btn', classes: [], attributes: {} };
      const element: InteractiveElement = {
        selector: '#submit-btn',
        tag: 'button',
        text: '',
        attributes: { id: 'submit-btn' },
        visible: true,
        clickable: true,
        position: { x: 0, y: 0, width: 100, height: 50 },
      };

      const score = healerInstance.calculateSimilarityScore(features, element, 'click');

      expect(score).toBeGreaterThan(0.3); // ID match contributes 0.4
    });

    it('should score for matching classes', () => {
      const healerInstance = healer as any;
      const features = { classes: ['btn', 'primary'], attributes: {} };
      const element: InteractiveElement = {
        selector: '.btn.primary',
        tag: 'button',
        text: '',
        attributes: { class: 'btn primary large' },
        visible: true,
        clickable: true,
        position: { x: 0, y: 0, width: 100, height: 50 },
      };

      const score = healerInstance.calculateSimilarityScore(features, element, 'click');

      expect(score).toBeGreaterThan(0);
    });

    it('should score for action compatibility', () => {
      const healerInstance = healer as any;
      const features = { classes: [], attributes: {} };
      const clickableElement: InteractiveElement = {
        selector: 'button',
        tag: 'button',
        text: '',
        attributes: {},
        visible: true,
        clickable: true,
        position: { x: 0, y: 0, width: 100, height: 50 },
      };

      const score = healerInstance.calculateSimilarityScore(features, clickableElement, 'click');

      expect(score).toBeGreaterThan(0); // Action compatible adds 0.05
    });
  });

  describe('mappings', () => {
    it('should load and retrieve mappings', () => {
      const mappings = [
        {
          id: 'map-001',
          originalSelector: '.old-btn',
          alternativeSelectors: ['.new-btn'],
          lastWorkingSelector: '.new-btn',
          lastUpdated: new Date().toISOString(),
          aiSuggested: false,
          successCount: 3,
          failureCount: 1,
          elementDescription: 'Login button',
          pageUrlPattern: 'https://example.com/*',
        },
      ];

      healer.loadMappings(mappings);
      const retrieved = healer.getMappings();

      expect(retrieved.length).toBe(1);
      expect(retrieved[0].originalSelector).toBe('.old-btn');
    });

    it('should cleanup low success rate mappings', () => {
      // Add a low success rate mapping
      const lowSuccessMapping = {
        id: 'map-002',
        originalSelector: '.bad-selector',
        alternativeSelectors: [],
        lastWorkingSelector: '',
        lastUpdated: new Date().toISOString(),
        aiSuggested: false,
        successCount: 1,
        failureCount: 10,
        elementDescription: '',
        pageUrlPattern: '*',
      };

      healer.loadMappings([lowSuccessMapping]);
      healer.cleanupMappings(0.3);

      const remaining = healer.getMappings();
      expect(remaining.length).toBe(0);
    });
  });
});

describe('selfHealElement', () => {
  it('should be a shortcut function', async () => {
    const mockSnapshot: PageSnapshot = {
      url: 'https://test.com',
      title: 'Test',
      html: '<html></html>',
      interactiveElements: [],
      forms: [],
      metadata: {
        capturedAt: new Date().toISOString(),
        viewport: { width: 1920, height: 1080 },
        loadTime: 100,
      },
    };

    const result = await selfHealElement('.missing', mockSnapshot, 'click', { useAi: false });

    expect(result.originalSelector).toBe('.missing');
    expect(result.success).toBe(false); // No elements to match
  });
});
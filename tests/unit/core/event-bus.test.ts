import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus, TestEventType } from '../../../src/core/event-bus';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  afterEach(() => {
    eventBus.removeAllListeners();
  });

  it('should emit and receive events', () => {
    let received = false;

    eventBus.onSafe(TestEventType.TEST_START, (data) => {
      expect(data.caseId).toBe('test-001');
      received = true;
    });

    eventBus.emitSafe(TestEventType.TEST_START, {
      caseId: 'test-001',
      caseName: 'Test Case',
      platform: 'pc-web',
    });

    expect(received).toBe(true);
  });

  it('should support once listener', () => {
    let count = 0;

    eventBus.onceSafe(TestEventType.TEST_PASS, () => {
      count++;
    });

    eventBus.emitSafe(TestEventType.TEST_PASS, {
      caseId: 'test-001',
      step: 1,
      durationMs: 100,
    });

    eventBus.emitSafe(TestEventType.TEST_PASS, {
      caseId: 'test-002',
      step: 1,
      durationMs: 200,
    });

    expect(count).toBe(1);
  });

  it('should support waitFor with timeout', async () => {
    const promise = eventBus.waitFor(TestEventType.RUN_COMPLETE, 100);

    eventBus.emitSafe(TestEventType.RUN_COMPLETE, {
      runId: 'run-001',
      summary: { passed: 1, failed: 0, total: 1 },
    });

    const result = await promise;
    expect(result.runId).toBe('run-001');
  });

  it('should timeout on waitFor', async () => {
    await expect(
      eventBus.waitFor(TestEventType.RUN_COMPLETE, 50)
    ).rejects.toThrow('超时');
  });
});
import { describe, it, expect } from 'vitest';
import {
  TestError,
  TestErrorCode,
  isRecoverable,
  getErrorSeverity,
} from '../../../src/core/error-handler';

describe('TestError', () => {
  it('should create TestError with all properties', () => {
    const error = new TestError(
      'Test failed',
      TestErrorCode.ASSERTION_FAILED,
      { step: 1 },
      'screenshot.png',
      false,
    );

    expect(error.message).toBe('Test failed');
    expect(error.code).toBe(TestErrorCode.ASSERTION_FAILED);
    expect(error.context).toEqual({ step: 1 });
    expect(error.screenshot).toBe('screenshot.png');
    expect(error.recoverable).toBe(false);
    expect(error.name).toBe('TestError');
  });

  it('should convert to JSON', () => {
    const error = new TestError(
      'Test failed',
      TestErrorCode.ELEMENT_NOT_FOUND,
      { selector: '#btn' },
    );

    const json = error.toJSON();
    expect(json.message).toBe('Test failed');
    expect(json.code).toBe(TestErrorCode.ELEMENT_NOT_FOUND);
    expect(json.recoverable).toBe(false); // 默认 false，除非显式设置
  });

  it('should create element not found error', () => {
    const error = TestError.elementNotFound('#button', { page: '/home' });

    expect(error.code).toBe(TestErrorCode.ELEMENT_NOT_FOUND);
    expect(error.message).toContain('元素未找到');
    expect(error.recoverable).toBe(true);
    expect(error.context?.selector).toBe('#button');
  });

  it('should create assertion failed error', () => {
    const error = TestError.assertionFailed(
      'element-visible',
      true,
      false,
      { selector: '#btn' },
    );

    expect(error.code).toBe(TestErrorCode.ASSERTION_FAILED);
    expect(error.message).toContain('断言失败');
    expect(error.recoverable).toBe(false);
  });

  it('should create timeout error', () => {
    const error = TestError.timeout('navigate', 30000);

    expect(error.code).toBe(TestErrorCode.NAVIGATION_TIMEOUT);
    expect(error.message).toContain('超时');
  });

  it('should create AI error', () => {
    const originalError = new Error('API failed');
    const error = TestError.aiError('API call failed', originalError);

    expect(error.code).toBe(TestErrorCode.AI_API_FAILED);
    expect(error.recoverable).toBe(true);
  });
});

describe('isRecoverable', () => {
  it('should return true for recoverable TestError', () => {
    const error = new TestError(
      'Element not found',
      TestErrorCode.ELEMENT_NOT_FOUND,
      {},
      undefined,
      true,
    );

    expect(isRecoverable(error)).toBe(true);
  });

  it('should return false for non-recoverable TestError', () => {
    const error = new TestError(
      'Critical error',
      TestErrorCode.BROWSER_LAUNCH_FAILED,
      {},
      undefined,
      false,
    );

    expect(isRecoverable(error)).toBe(false);
  });

  it('should return false for regular Error', () => {
    const error = new Error('Regular error');
    expect(isRecoverable(error)).toBe(false);
  });
});

describe('getErrorSeverity', () => {
  it('should return critical for browser launch failed', () => {
    const error = new TestError(
      'Browser launch failed',
      TestErrorCode.BROWSER_LAUNCH_FAILED,
    );
    expect(getErrorSeverity(error)).toBe('critical');
  });

  it('should return high for page crash', () => {
    const error = new TestError(
      'Page crashed',
      TestErrorCode.PAGE_CRASH,
    );
    expect(getErrorSeverity(error)).toBe('high');
  });

  it('should return medium for other errors', () => {
    const error = new TestError(
      'Assertion failed',
      TestErrorCode.ASSERTION_FAILED,
    );
    expect(getErrorSeverity(error)).toBe('medium');
  });

  it('should return medium for regular Error', () => {
    const error = new Error('Regular error');
    expect(getErrorSeverity(error)).toBe('medium');
  });
});
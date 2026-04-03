import { describe, it, expect } from 'vitest';
import { defaultConfig } from '../../config/default.config';

describe('default.config', () => {
  it('should have default test settings', () => {
    expect(defaultConfig.testDepth).toBe(3);
    expect(defaultConfig.timeout).toBe(30000);
    expect(defaultConfig.retryCount).toBe(2);
    expect(defaultConfig.parallelism).toBe(3);
  });

  it('should have screenshot settings enabled', () => {
    expect(defaultConfig.screenshotOnFailure).toBe(true);
    expect(defaultConfig.screenshotOnEveryStep).toBe(false);
    expect(defaultConfig.videoOnFailure).toBe(true);
  });

  it('should have AI settings enabled', () => {
    expect(defaultConfig.enableAiOptimization).toBe(true);
    expect(defaultConfig.enableAiFallback).toBe(true);
  });

  it('should have default report formats', () => {
    expect(defaultConfig.reportFormats).toContain('html');
    expect(defaultConfig.reportFormats).toContain('json');
  });

  it('should have default test type', () => {
    expect(defaultConfig.defaultTestType).toBe('smoke');
  });

  it('should have default platform', () => {
    expect(defaultConfig.defaultPlatform).toBe('pc-web');
  });

  it('should have default viewport', () => {
    expect(defaultConfig.defaultViewport.width).toBe(1920);
    expect(defaultConfig.defaultViewport.height).toBe(1080);
  });
});
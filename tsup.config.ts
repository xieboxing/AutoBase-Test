import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    cli: 'src/cli/index.ts',
    core: 'src/core/index.ts',
    ai: 'src/ai/index.ts',
    crawlers: 'src/crawlers/index.ts',
    testers: 'src/testers/index.ts',
    'testers-web': 'src/testers/web/index.ts',
    'testers-app': 'src/testers/app/index.ts',
    'testers-performance': 'src/testers/performance/index.ts',
    'testers-visual': 'src/testers/visual/index.ts',
    'testers-accessibility': 'src/testers/accessibility/index.ts',
    'testers-security': 'src/testers/security/index.ts',
    'testers-api': 'src/testers/api/index.ts',
    'testers-compatibility': 'src/testers/compatibility/index.ts',
    'testers-stability': 'src/testers/stability/index.ts',
    'test-cases': 'src/test-cases/index.ts',
    reporters: 'src/reporters/index.ts',
    knowledge: 'src/knowledge/index.ts',
    utils: 'src/utils/index.ts',
    types: 'src/types/index.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  external: [
    'playwright',
    '@playwright/test',
    'webdriverio',
    '@wdio/appium-service',
    '@wdio/local-runner',
    'better-sqlite3',
  ],
  esbuildOptions(options) {
    options.alias = {
      '@': './src',
    };
  },
});
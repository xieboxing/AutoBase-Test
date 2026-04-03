// Accessibility Testers Module
// 无障碍测试模块导出

export {
  A11yTester,
  scanAccessibility,
  scanAccessibilityBatch,
  type A11yTesterConfig,
  type AxeScanResult,
  type AxeViolation,
  type AxeIncomplete,
  type AxeNodeResult,
} from './a11y-tester.js';

export {
  KeyboardTester,
  testKeyboardNavigation,
  type KeyboardTesterConfig,
  type KeyboardTestResult,
  type KeyboardIssue,
  type FocusedElement,
} from './keyboard-tester.js';
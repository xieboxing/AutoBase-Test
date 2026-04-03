// 截图对比测试器
export {
  ScreenshotTester,
  compareScreenshots,
  createBaseline,
  type ScreenshotCompareResult,
  type ScreenshotTesterConfig,
  type IgnoreRegion,
} from './screenshot-tester.js';

// 基线图管理器
export {
  BaselineManager,
  createBaselineManager,
  type BaselineMetadata,
  type BaselineHistoryEntry,
  type BaselineManagerConfig,
} from './baseline-manager.js';

// 布局检查测试器
export {
  LayoutTester,
  testLayout,
  type LayoutIssue,
  type LayoutIssueType,
  type LayoutIssueSeverity,
  type LayoutTestResult,
  type LayoutTesterConfig,
} from './layout-tester.js';

// 文字检查测试器
export {
  TextTester,
  testText,
  type TextIssue,
  type TextIssueType,
  type TextIssueSeverity,
  type TextTestResult,
  type TextTesterConfig,
} from './text-tester.js';

// 颜色对比度测试器
export {
  ColorContrastTester,
  checkColorContrast,
  type ColorContrastTesterConfig,
  type ColorContrastResult,
  type ContrastCheckElement,
  type ContrastIssue,
} from './color-contrast-tester.js';
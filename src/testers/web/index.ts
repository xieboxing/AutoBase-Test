// Web 测试器模块入口

// PC Web 测试器
export { PcTester, runPcTest, type PcTesterConfig, type BrowserName } from './pc-tester.js';

// H5 移动端测试器
export { H5Tester, runH5Test, type H5TesterConfig, type DeviceName } from './h5-tester.js';

// 响应式测试器
export {
  ResponsiveTester,
  testResponsive,
  type ResponsiveTesterConfig,
  type ResponsiveTestResult,
  type ResponsiveIssue,
  type ViewportConfig,
} from './responsive-tester.js';

// 跨浏览器测试器
export {
  CrossBrowserTester,
  testCrossBrowser,
  type CrossBrowserTesterConfig,
  type CrossBrowserTestResult,
  type BrowserTestResult,
  type BrowserDifference,
} from './cross-browser-tester.js';

// 交互测试器
export {
  InteractionTester,
  testInteractions,
  type InteractionTesterConfig,
  type InteractionTestResult,
} from './interaction-tester.js';

// 表单测试器
export {
  FormTester,
  testForms,
  type FormTesterConfig,
  type FormTestResult,
  type FormInfo,
  type FormField,
  type FieldTestResult,
} from './form-tester.js';

// 导航测试器
export {
  NavigationTester,
  testNavigation,
  type NavigationTesterConfig,
  type NavigationTestResult,
  type LinkTestResult,
  type LinkInfo,
  type NavigationIssue,
} from './navigation-tester.js';
// APP 安装/卸载测试器
export {
  InstallTester,
  runInstallTest,
  type InstallTesterConfig,
  type InstallTestResult,
} from './install-tester.js';

// APP 启动测试器
export {
  LaunchTester,
  runLaunchTest,
  type LaunchTesterConfig,
  type LaunchTestResult,
  type LaunchTimeResult,
} from './launch-tester.js';

// APP UI 交互测试器
export {
  UiTester,
  runUiTest,
  type UiTesterConfig,
  type LocatorStrategy,
} from './ui-tester.js';

// APP 手势测试器
export {
  GestureTester,
  runGestureTests,
  type GestureTesterConfig,
  type GestureTestResult,
} from './gesture-tester.js';

// APP 生命周期测试器
export {
  LifecycleTester,
  runLifecycleTests,
  type LifecycleTesterConfig,
  type LifecycleTestResult,
} from './lifecycle-tester.js';

// APP 权限测试器
export {
  PermissionTester,
  runPermissionTests,
  type PermissionTesterConfig,
  type PermissionTestResult,
} from './permission-tester.js';
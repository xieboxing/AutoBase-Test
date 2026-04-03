/**
 * 设备信息
 */
export interface DeviceInfo {
  id: string;
  name: string;
  type: 'android' | 'ios' | 'desktop';
  os: string;
  osVersion: string;
  screen: {
    width: number;
    height: number;
    density: number;
  };
  capabilities: string[];
  status: 'connected' | 'disconnected' | 'busy' | 'error';
}

/**
 * Android 设备信息
 */
export interface AndroidDeviceInfo extends DeviceInfo {
  type: 'android';
  model: string;
  manufacturer: string;
  sdkVersion: number;
  abi: string;
  isEmulator: boolean;
}

/**
 * 浏览器信息
 */
export interface BrowserInfo {
  name: 'chromium' | 'firefox' | 'webkit' | 'chrome' | 'safari' | 'edge';
  version: string;
  installed: boolean;
  path?: string;
}

/**
 * Appium 会话配置
 */
export interface AppiumSessionConfig {
  deviceName: string;
  platformName: 'Android' | 'iOS';
  platformVersion?: string;
  automationName: 'UiAutomator2' | 'XCuiTest';
  app?: string;
  appPackage?: string;
  appActivity?: string;
  noReset?: boolean;
  fullReset?: boolean;
  newCommandTimeout?: number;
  autoLaunch?: boolean;
}

/**
 * Playwright 浏览器配置
 */
export interface PlaywrightBrowserConfig {
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  device?: string;
  userAgent?: string;
  locale?: string;
  timezone?: string;
  geolocation?: {
    latitude: number;
    longitude: number;
  };
  permissions?: string[];
}

/**
 * 环境检查结果
 */
export interface EnvironmentCheckResult {
  node: {
    version: string;
    valid: boolean;
  };
  browsers: BrowserInfo[];
  android?: {
    adb: boolean;
    emulator: boolean;
    devices: AndroidDeviceInfo[];
  };
  appium?: {
    installed: boolean;
    version?: string;
    running: boolean;
  };
  ai?: {
    apiKeySet: boolean;
    provider: string;
  };
  allValid: boolean;
  issues: string[];
}
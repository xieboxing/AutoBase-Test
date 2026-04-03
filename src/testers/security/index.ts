// Security Testers Module
// 安全测试模块导出

export {
  XssTester,
  testXss,
  testXssBatch,
  XSS_PAYLOADS,
  type XssTesterConfig,
  type XssDetectionResult,
  type XssVulnerability,
  type InputField,
} from './xss-tester.js';

export {
  HeaderTester,
  checkSecurityHeaders,
  checkSecurityHeadersBatch,
  SECURITY_HEADERS,
  type HeaderTesterConfig,
  type HeaderCheckResult,
  type SecurityHeaderIssue,
  type SecurityHeaderInfo,
  type RequiredSecurityHeader,
} from './header-tester.js';

export {
  SslTester,
  checkSsl,
  checkSslBatch,
  type SslTesterConfig,
  type SslCheckResult,
  type SslIssue,
  type CertificateInfo,
} from './ssl-tester.js';

export {
  SensitiveDataTester,
  scanPageForSensitiveData,
  SENSITIVE_DATA_PATTERNS,
  type SensitiveDataTesterConfig,
  type SensitiveDataResult,
  type SensitiveDataFinding,
  type SensitiveDataPattern,
  type SensitiveDataType,
} from './sensitive-data-tester.js';

export {
  CsrfTester,
  checkCsrf,
  type CsrfTesterConfig,
  type CsrfCheckResult,
  type FormCsrfResult,
  type CookieCsrfResult,
  type CsrfIssue,
  type CookieInfo,
} from './csrf-tester.js';
import { z } from 'zod';

/**
 * 安全检查结果 Schema
 */
export const securityCheckSchema = z.object({
  summary: z.string().describe('安全评估摘要'),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).describe('风险等级'),
  vulnerabilities: z.array(z.object({
    type: z.string().describe('漏洞类型'),
    severity: z.enum(['critical', 'high', 'medium', 'low']).describe('严重程度'),
    description: z.string().describe('问题描述'),
    location: z.string().describe('发现位置'),
    evidence: z.string().optional().describe('证据'),
    recommendation: z.string().describe('修复建议'),
    cwe: z.string().optional().describe('CWE 编号'),
  })).describe('漏洞列表'),
  warnings: z.array(z.object({
    type: z.string().describe('警告类型'),
    description: z.string().describe('描述'),
    location: z.string().describe('位置'),
  })).describe('警告列表'),
  recommendations: z.array(z.string()).describe('安全建议'),
  complianceStatus: z.object({
    owaspTop10: z.boolean().describe('是否符合 OWASP Top 10'),
    pciDss: z.boolean().optional().describe('是否符合 PCI DSS'),
  }).describe('合规状态'),
});

export type SecurityCheckResult = z.infer<typeof securityCheckSchema>;

/**
 * 构建安全检查 Prompt
 */
export function buildSecurityCheckPrompt(params: {
  pageUrl: string;
  headers: Record<string, string>;
  cookies?: Array<{ name: string; secure: boolean; httpOnly: boolean; sameSite?: string }>;
  forms?: Array<{ action: string; method: string; hasCSRFToken: boolean }>;
  scripts?: Array<{ src: string; integrity?: string }>;
  externalResources?: string[];
  sensitiveDataFound?: Array<{ type: string; location: string }>;
}): string {
  const securityHeaders = {
    'Strict-Transport-Security': params.headers['strict-transport-security'],
    'Content-Security-Policy': params.headers['content-security-policy'],
    'X-Content-Type-Options': params.headers['x-content-type-options'],
    'X-Frame-Options': params.headers['x-frame-options'],
    'X-XSS-Protection': params.headers['x-xss-protection'],
    'Referrer-Policy': params.headers['referrer-policy'],
    'Permissions-Policy': params.headers['permissions-policy'],
  };

  const cookiesSummary = params.cookies
    ?.map(c => `- ${c.name}: secure=${c.secure}, httpOnly=${c.httpOnly}, sameSite=${c.sameSite || '未设置'}`)
    .join('\n') || '无 Cookie 信息';

  const formsSummary = params.forms
    ?.map(f => `- action=${f.action}, method=${f.method}, CSRF=${f.hasCSRFToken ? '有' : '无'}`)
    .join('\n') || '无表单信息';

  return `你是一位Web安全专家。请分析页面的安全性。

## 页面信息
- URL: ${params.pageUrl}

## 安全响应头
\`\`\`json
${JSON.stringify(securityHeaders, null, 2)}
\`\`\`

## Cookie 安全设置
${cookiesSummary}

## 表单安全
${formsSummary}

## 外部资源
${params.externalResources?.slice(0, 20).join('\n') || '无外部资源'}

${params.sensitiveDataFound && params.sensitiveDataFound.length > 0 ? `## 发现的敏感数据
${params.sensitiveDataFound.map(s => `- ${s.type} 在 ${s.location}`).join('\n')}` : ''}

## 检查要点

请检查以下安全问题：

1. **XSS 漏洞**
   - 输入是否正确转义
   - CSP 是否配置正确

2. **CSRF 防护**
   - 表单是否有 CSRF Token
   - Cookie 的 SameSite 设置

3. **安全响应头**
   - HSTS 是否启用
   - CSP 是否配置
   - X-Frame-Options 是否设置

4. **敏感信息泄露**
   - 是否暴露 API Key
   - 是否暴露用户信息

5. **Cookie 安全**
   - 是否设置 Secure
   - 是否设置 HttpOnly
   - SameSite 属性

6. **第三方资源**
   - 是否使用 SRI
   - 外部资源是否可信

请输出JSON格式的安全分析结果，包含：
1. 摘要评估
2. 风险等级
3. 漏洞列表
4. 警告列表
5. 安全建议
6. 合规状态

用中文回答，输出严格的JSON格式。`;
}

/**
 * 解析安全检查结果
 */
export function parseSecurityCheckResult(content: string): SecurityCheckResult {
  try {
    const parsed = JSON.parse(content);
    return securityCheckSchema.parse(parsed);
  } catch {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      const parsed = JSON.parse(jsonMatch[1]);
      return securityCheckSchema.parse(parsed);
    }

    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonStr = content.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      return securityCheckSchema.parse(parsed);
    }

    throw new Error('无法解析安全检查结果');
  }
}

/**
 * 快速安全检查（无需 AI）
 */
export function quickSecurityCheck(params: {
  headers: Record<string, string>;
  cookies?: Array<{ name: string; secure: boolean; httpOnly: boolean; sameSite?: string }>;
  forms?: Array<{ hasCSRFToken: boolean }>;
}): SecurityCheckResult {
  const vulnerabilities: SecurityCheckResult['vulnerabilities'] = [];
  const warnings: SecurityCheckResult['warnings'] = [];

  // 检查安全响应头
  const requiredHeaders = {
    'strict-transport-security': 'HSTS',
    'content-security-policy': 'CSP',
    'x-frame-options': 'X-Frame-Options',
    'x-content-type-options': 'X-Content-Type-Options',
  };

  for (const [header, name] of Object.entries(requiredHeaders)) {
    if (!params.headers[header]) {
      vulnerabilities.push({
        type: 'missing-security-header',
        severity: 'medium',
        description: `缺少 ${name} 响应头`,
        location: 'HTTP Response Headers',
        recommendation: `添加 ${header} 响应头`,
      });
    }
  }

  // 检查 Cookie 安全
  for (const cookie of params.cookies || []) {
    if (!cookie.secure) {
      warnings.push({
        type: 'insecure-cookie',
        description: `Cookie ${cookie.name} 未设置 Secure 标志`,
        location: `Cookie: ${cookie.name}`,
      });
    }
    if (!cookie.httpOnly) {
      warnings.push({
        type: 'cookie-accessible-to-js',
        description: `Cookie ${cookie.name} 未设置 HttpOnly 标志`,
        location: `Cookie: ${cookie.name}`,
      });
    }
    if (!cookie.sameSite) {
      warnings.push({
        type: 'cookie-samesite-missing',
        description: `Cookie ${cookie.name} 未设置 SameSite 属性`,
        location: `Cookie: ${cookie.name}`,
      });
    }
  }

  // 检查 CSRF Token
  const formsWithoutCSRF = (params.forms || []).filter(f => !f.hasCSRFToken);
  if (formsWithoutCSRF.length > 0) {
    vulnerabilities.push({
      type: 'csrf',
      severity: 'high',
      description: `${formsWithoutCSRF.length} 个表单缺少 CSRF Token`,
      location: 'Forms',
      recommendation: '为所有表单添加 CSRF Token',
      cwe: 'CWE-352',
    });
  }

  // 计算风险等级
  const criticalCount = vulnerabilities.filter(v => v.severity === 'critical').length;
  const highCount = vulnerabilities.filter(v => v.severity === 'high').length;
  const mediumCount = vulnerabilities.filter(v => v.severity === 'medium').length;

  let riskLevel: SecurityCheckResult['riskLevel'] = 'low';
  if (criticalCount > 0) riskLevel = 'critical';
  else if (highCount > 0) riskLevel = 'high';
  else if (mediumCount > 2) riskLevel = 'medium';

  return {
    summary: `发现 ${vulnerabilities.length} 个安全问题和 ${warnings.length} 个警告`,
    riskLevel,
    vulnerabilities,
    warnings,
    recommendations: [
      '定期进行安全审计',
      '保持依赖项更新',
      '实施安全开发最佳实践',
    ],
    complianceStatus: {
      owaspTop10: vulnerabilities.filter(v => v.severity === 'critical' || v.severity === 'high').length === 0,
    },
  };
}

/**
 * XSS 向量检测
 */
export const XSS_VECTORS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '"><script>alert(1)</script>',
  "'-alert(1)-'",
  'javascript:alert(1)',
  '<body onload=alert(1)>',
  '<iframe src="javascript:alert(1)">',
];

/**
 * 敏感信息正则
 */
export const SENSITIVE_PATTERNS = [
  { type: 'API Key', pattern: /(?:api[_-]?key|apikey)['":\s]*['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi },
  { type: 'AWS Key', pattern: /AKIA[0-9A-Z]{16}/g },
  { type: 'Private Key', pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g },
  { type: 'Password', pattern: /(?:password|passwd|pwd)['":\s]*['"]?([^'"\s]{4,})['"]?/gi },
  { type: 'Token', pattern: /(?:token|bearer)['":\s]*['"]?([a-zA-Z0-9_\-\.]{20,})['"]?/gi },
  { type: 'Email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { type: 'Phone', pattern: /(?:\+?86)?1[3-9]\d{9}/g },
];
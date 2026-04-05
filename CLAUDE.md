# CLAUDE.md — AI 驱动全自动化测试平台 · 工作指引与代码规范

## 项目定位

这是一个 **AI 驱动的全自动化测试平台**，产品经理（非技术人员）只需要：
- 提供一个 **APK 包** → 自动测试 Android APP
- 提供一个 **URL** → 自动测试 PC Web / H5 Web
- 查看 **中文测试报告** → 了解所有问题
- 无需手写测试用例 → AI 自动生成 + 自动优化

## 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript 5.x strict |
| Web 自动化 | Playwright |
| APP 自动化 | Appium 2 + WebDriverIO |
| 性能测试 | Lighthouse CI |
| 无障碍测试 | axe-core + Playwright |
| 视觉对比 | pixelmatch |
| AI 客户端 | Anthropic SDK / OpenAI SDK |
| CLI | Commander.js + Inquirer |
| 数据库 | better-sqlite3 |
| 测试框架 | vitest |

## 目录结构

```
auto-test-platform/
├── src/
│   ├── cli/           # 命令行入口
│   ├── core/          # 核心引擎（编排器、调度器、执行器）
│   ├── ai/            # AI 模块（分析、生成、自愈、优化）
│   ├── crawlers/      # 页面爬虫
│   ├── testers/       # 各类测试器
│   ├── knowledge/     # 知识库（数据库、历史、失败模式）
│   ├── reporters/     # 报告生成
│   ├── test-cases/    # 用例管理
│   ├── utils/         # 工具函数
│   └── types/         # 类型定义
├── config/            # 全局配置
├── db/                # SQLite 数据库
├── data/              # 运行时数据
├── tests/             # 框架自身测试
└── docs/              # 补充文档
```

## 核心命令

```bash
# 测试网站
npx autotest web https://example.com

# 测试 APP
npx autotest app ./my-app.apk

# 测试 API
npx autotest api https://api.example.com/v1

# 探索式测试
npx autotest explore https://example.com

# AI 优化
npx autotest optimize --project myproject

# 查看报告
npx autotest report --latest

# 环境检查
npx autotest doctor
```

## 代码规范

### TypeScript 规范

1. **严格模式**：`strict: true`，禁止 `any`
2. **命名规范**：
   - 文件：kebab-case（`web-crawler.ts`）
   - 类：PascalCase（`WebCrawler`）
   - 函数/变量：camelCase（`runTests`）
   - 常量：UPPER_SNAKE_CASE（`MAX_RETRY_COUNT`）

3. **导入顺序**：
   ```typescript
   // 1. Node.js 内置
   import path from 'node:path';
   
   // 2. 第三方库
   import { chromium } from 'playwright';
   
   // 3. 项目内部（使用 @ 别名）
   import { logger } from '@/core/logger';
   
   // 4. 类型导入
   import type { TestCase } from '@/types';
   ```

4. **路径别名**：`@/` → `src/`

### 函数规范

- 所有公共函数必须有 JSDoc 注释
- 返回类型必须显式声明
- 错误使用 `TestError` 类

```typescript
/**
 * 执行测试用例
 * @param testCase 测试用例
 * @param platform 测试平台
 * @returns 测试结果
 */
async function runTest(testCase: TestCase, platform: Platform): Promise<TestCaseResult> {
  // ...
}
```

### 日志规范

```typescript
import { logger } from '@/core/logger';

logger.info('🚀 开始测试', { project: 'myapp' });
logger.step('📍 第1步: 打开登录页面');
logger.pass('✅ 断言通过');
logger.fail('❌ 断言失败', { error: '...' });
logger.ai('🤖 AI 分析中...');
```

## 测试用例格式

```json
{
  "id": "tc-001",
  "name": "测试用例名称",
  "priority": "P0",
  "type": "functional",
  "platform": ["pc-web"],
  "steps": [
    { "order": 1, "action": "navigate", "target": "/login" },
    { "order": 2, "action": "fill", "target": "#email", "value": "test@example.com" },
    { "order": 3, "action": "click", "target": "button[type=submit]" },
    { "order": 4, "action": "assert", "type": "url-contains", "value": "/dashboard" }
  ]
}
```

### 支持的 Action 类型

| Action | 参数 | 说明 |
|--------|------|------|
| `navigate` | target | 导航到 URL |
| `click` | target | 点击元素 |
| `fill` | target, value | 填写输入框 |
| `select` | target, value | 选择下拉框 |
| `hover` | target | 悬停 |
| `scroll` | direction | 滚动 |
| `wait` | value | 等待毫秒数 |
| `assert` | type, target?, value? | 断言 |

### 支持的 Assert 类型

| Type | 说明 |
|------|------|
| `element-visible` | 元素可见 |
| `element-hidden` | 元素隐藏 |
| `text-contains` | 文本包含 |
| `url-contains` | URL 包含 |
| `title-equals` | 标题等于 |
| `element-count` | 元素数量 |

## AI 模块规范

### AI 客户端

```typescript
import { createAiClient } from '@/ai/client';

const client = createAiClient({ provider: 'anthropic' });
const response = await client.chat(prompt);
```

### Prompt 模板

位置：`src/ai/prompts/`

所有 Prompt 必须：
1. 输出严格的 JSON 格式
2. 使用 Zod 校验返回值
3. 支持无 AI 降级

### 自愈机制

当元素定位失败时：
1. 截图当前页面
2. 查询知识库历史映射
3. 调用 AI 分析新选择器
4. 重试并更新知识库

## 知识库规范

### 数据库操作

```typescript
import { getDatabase, initializeDatabase } from '@/knowledge/db';

const db = await initializeDatabase({ dbPath: './db/sqlite.db' });

// 查询
const rows = db.query('SELECT * FROM test_runs WHERE project = ?', [project]);

// 执行
db.execute('INSERT INTO test_runs (...) VALUES (...)');

// 关闭
db.close();
```

### 核心表

- `test_runs` - 测试运行记录
- `test_results` - 测试用例结果
- `element_mappings` - 元素定位映射
- `failure_patterns` - 失败模式库
- `case_statistics` - 用例统计

## 报告规范

HTML 报告内容：

1. 测试概览（通过率饼图）
2. 关键问题（P0/P1 失败项）
3. 详细结果（按类别分组）
4. 性能数据（Lighthouse 评分）
5. 安全检查
6. 无障碍检查
7. 兼容性矩阵
8. 趋势对比
9. AI 建议

所有内容必须是中文。

## 环境变量

```bash
# .env.example

# AI 模型配置
AI_PROVIDER=anthropic
AI_API_KEY=your-api-key
AI_MODEL=claude-sonnet-4-20250514

# Appium 配置
APPIUM_HOST=127.0.0.1
APPIUM_PORT=4723
ANDROID_HOME=/path/to/android/sdk

# 代理配置（可选）
HTTP_PROXY=http://localhost:7890
HTTPS_PROXY=http://localhost:7890
```

## 开发命令

```bash
# 开发模式
npm run dev

# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 测试
npm run test:self

# 构建
npm run build
```

## 修改代码时必须遵守的原则

1. **类型安全**：禁止 `any`，必须使用具体类型
2. **错误处理**：使用 `TestError` 类，附带错误码和上下文
3. **日志输出**：使用 `logger` 模块，带 emoji 前缀
4. **AI 降级**：所有 AI 功能必须有规则引擎降级方案
5. **数据库幂等**：迁移脚本必须可重复执行
6. **中文输出**：报告、日志、错误信息使用中文
7. **测试覆盖**：新增公共方法必须有单元测试

## 提交前检查清单

- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 无错误
- [ ] `npm run test:self` 通过
- [ ] 新增代码有 JSDoc 注释
- [ ] 新增功能有降级方案（AI 相关）
- [ ] 数据库变更有迁移脚本

---

## 金融 APP 流程测试（新增）

### 模块位置

```
src/testers/financial/
├── index.ts                 # 模块导出
├── page-inspector.ts        # 页面巡检器
├── financial-flow-tester.ts # 金融流程测试器
└── language-runner.ts       # 多语言循环执行器

src/types/financial.types.ts # 金融测试类型定义
src/config/financial-config.ts # 金融配置加载验证
src/reporters/financial-report.ts # 金融测试报告生成器
src/cli/commands/test-financial.ts # CLI 命令入口

configs/financial/           # 金融 APP 配置文件
docs/templates/              # 金融 APP 测试文档模板
```

### CLI 命令

```bash
# 金融流程测试
npx autotest financial ./app.apk --config ./configs/financial/xxx.json

# 指定语言
npx autotest financial ./app.apk --config ./configs/financial/xxx.json --languages zh-CN,en-US

# 跳过交易
npx autotest financial ./app.apk --config ./configs/financial/xxx.json --skip-trading
```

### 配置文件约定

1. **位置**：`configs/financial/{app-name}.json`
2. **账号密码**：通过环境变量管理，配置文件只写环境变量名
3. **定位器**：支持主定位器 + fallback 备用定位器
4. **待补充标记**：不确定的定位器用 `(待补充)` 标记

### 页面巡检逻辑

页面巡检器在每个页面执行以下检查：

**第一轮基础检查：**
1. 自动截图
2. 保存 Page Source / UI XML
3. 提取页面文本
4. 执行规则检测：
   - 页面空白检测
   - 关键元素缺失
   - 未翻译 Key
   - 中英文混杂
   - 占位符未替换
   - 乱码
   - 文本截断
   - 元素重叠
   - 按钮遮挡

**第二轮增强检查：**
5. OCR 文本识别（可选，需配置 OCR 服务）
6. OCR 与 DOM 文本对比检测渲染问题
7. 问题区域标注截图（颜色框标注）
8. 置信度评分（综合多种证据）
9. 问题去重和聚类
10. AI 视觉分析（可选，需配置 AI API）

### 多语言执行逻辑

1. 读取配置中的支持语言列表
2. 按顺序切换语言
3. 每个语言完整重新执行主流程
4. 生成按语言分组的报告
5. 可选择是否恢复默认语言

### 报告生成

报告位置：`data/reports/financial-{timestamp}/`

包含：
- 测试概览（设备、APK、时间）
- 主流程结果表格
- 按语言展示的详细结果
- 页面巡检结果（截图、问题列表）
- 问题列表（按严重级别排序）
- 交易结果（开仓、持仓、平仓、余额验证）
- 整体评估（通过率、风险等级）

### 新增 APP 时必须更新的文件

| 文件 | 说明 |
|------|------|
| `configs/financial/{app}.json` | APP 配置文件（复制 slickorps.demo.json 作为模板） |
| `docs/{APP}测试文档.md` | APP 业务测试文档（复制 docs/templates/金融APP测试文档模板.md） |
| `.env` | 账号密码环境变量 |

### 文档模板位置

新增 APP 测试文档时，使用以下模板：

```
docs/templates/金融APP测试文档模板.md
```

### AI 在这个仓库中的正确工作方式

1. **先读 APP-Test.md**：了解平台能力、测试流程、配置方式
2. **再读 CLAUDE.md**（本文档）：了解仓库结构、核心模块、开发规范
3. **再根据任务定位 docs/某个APP测试文档.md**：了解具体 APP 的业务测试要求
4. **再查看 configs/ 对应配置**：了解具体 APP 的定位器配置
5. **执行测试命令**：根据配置执行测试

### 如果真实 locator 不全

1. 使用 `(待补充)` 标记在配置文件中
2. 在测试文档中说明哪些定位器需要补充
3. 提供定位器获取方法（Appium Inspector）
4. 框架支持 fallback 定位器用于自愈

### 第二轮已实现增强

以下增强功能已实现：

| 功能 | 模块 | 说明 |
|------|------|------|
| OCR 文本识别 | `src/utils/ocr.ts` | 支持 Tesseract.js、Google Vision、AI Vision |
| 图片标注 | `src/utils/image-annotator.ts` | 在截图上标注问题区域 |
| 问题分析器 | `src/testers/financial/issue-analyzer.ts` | 置信度评分、去重、聚类 |
| 页面探测 | `src/cli/commands/probe.ts` | 发现元素、生成定位器建议 |

### 第二轮新增 CLI 命令

```bash
# 页面探测（发现元素和定位器建议）
npx autotest probe --app ./app.apk

# 探测指定页面
npx autotest probe --app ./app.apk --page "登录页"
```

### 第二轮新增模块位置

```
src/utils/
├── ocr.ts                   # OCR 文本识别模块
├── image-annotator.ts       # 图片标注模块

src/testers/financial/
├── issue-analyzer.ts        # 问题分析器（第二轮新增）

src/cli/commands/
├── probe.ts                 # 页面探测命令（第二轮新增）

src/types/financial.types.ts # 新增 Round 2 类型定义
```

### OCR 使用说明

OCR 支持多种后端，按优先级选择：

1. **AI Vision（推荐）**：使用 Claude/GPT-4V 的视觉能力
2. **Google Vision API**：需要配置 Google Cloud 凭证
3. **AWS Textract**：需要配置 AWS 凭证
4. **Tesseract.js**：本地 OCR，无需外部服务

```typescript
// OCR 配置示例
const ocrConfig = {
  enabled: true,
  provider: 'ai-vision',  // 或 'tesseract'、'google-vision'
  languages: ['zh-CN', 'en-US'],
  minConfidence: 0.5,
};
```

### 图片标注说明

标注系统会：
- 用红色框标注 P0 级别问题
- 用橙色框标注 P1 级别问题
- 用蓝色框标注 P2 级别问题
- 用灰色框标注 P3 级别问题
- 在框上显示问题类型标签

### 未来第三轮扩展方向

- 性能监控和分析
- iOS APP 支持
- 更丰富的检查规则
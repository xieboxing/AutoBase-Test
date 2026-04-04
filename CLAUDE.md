


# 自动化测试项目：CLAUDE.md + CHECKLIST.md

---

## 文件一：`CLAUDE.md`

```markdown
# CLAUDE.md — AI 驱动全自动化测试平台 · 工作指引与代码规范

## 🔴 核心工作流程

每次启动时，请执行以下步骤：
1. 读取本文件 `CLAUDE.md`，了解代码规范和技术架构
2. 读取 `CHECKLIST.md`，找到第一个状态为 `[ ]`（未完成）的任务
3. 执行该任务，完成后将 `[ ]` 改为 `[x]`，并在后面追加完成日期
4. 如果 token 充裕，继续下一个 `[ ]` 任务
5. 每完成一个 Phase，运行一次 `npm run test:self` 确保框架自身测试通过
6. 如果任务中途 token 不够，在 CHECKLIST.md 对应任务后追加 `⏸️ 进行中` 标记和进度说明

## 🎯 项目定位

这是一个 **AI 驱动的全自动化测试平台**，产品经理（非技术人员）只需要：
- 提供一个 **APK 包** → 自动测试 Android APP
- 提供一个 **URL** → 自动测试 PC Web / H5 Web
- 查看 **中文测试报告** → 了解所有问题
- 无需手写测试用例 → AI 自动生成 + 自动优化

## 📁 项目目录结构（严格遵守）

```
auto-test-platform/
├── CLAUDE.md                              # 本文件
├── CHECKLIST.md                           # 功能清单
├── README.md                              # 使用文档（小白看得懂）
├── package.json
├── tsconfig.json
├── vitest.config.ts                       # 框架自身单元测试
├── .env                                   # 环境变量（不提交git）
├── .env.example                           # 环境变量模板
├── .gitignore
│
├── config/                                # 全局配置
│   ├── default.config.ts                  # 默认配置
│   ├── devices.config.ts                  # 设备/视口预设
│   ├── ai.config.ts                       # AI 模型配置
│   └── index.ts
│
├── src/
│   ├── cli/                               # 命令行入口
│   │   ├── index.ts                       # CLI 主入口
│   │   ├── commands/                      # 子命令
│   │   │   ├── test-web.ts                # 测试 Web（PC + H5）
│   │   │   ├── test-app.ts                # 测试 APP（APK）
│   │   │   ├── test-api.ts                # 测试 API
│   │   │   ├── test-all.ts                # 全部测试
│   │   │   ├── report.ts                  # 查看历史报告
│   │   │   ├── optimize.ts               # AI 优化测试流程
│   │   │   └── init.ts                    # 初始化新项目测试配置
│   │   └── utils/
│   │       ├── spinner.ts                 # 终端加载动画
│   │       └── prompts.ts                # 交互式提问
│   │
│   ├── core/                              # 核心引擎
│   │   ├── orchestrator.ts                # 测试编排器（总指挥）
│   │   ├── test-runner.ts                 # 测试执行器
│   │   ├── result-collector.ts            # 结果收集器
│   │   ├── lifecycle.ts                   # 生命周期管理
│   │   ├── logger.ts                      # 日志模块
│   │   ├── error-handler.ts               # 错误处理
│   │   └── event-bus.ts                   # 事件总线（模块间通信）
│   │
│   ├── ai/                                # AI 智能模块 🧠
│   │   ├── client.ts                      # AI API 客户端（支持多模型）
│   │   ├── prompts/                       # Prompt 模板
│   │   │   ├── analyze-page.prompt.ts     # 分析页面结构
│   │   │   ├── generate-cases.prompt.ts   # 生成测试用例
│   │   │   ├── analyze-failure.prompt.ts  # 分析失败原因
│   │   │   ├── optimize-flow.prompt.ts    # 优化测试流程
│   │   │   ├── generate-report.prompt.ts  # 生成测试报告
│   │   │   ├── accessibility-check.prompt.ts  # 无障碍检查
│   │   │   └── security-check.prompt.ts   # 安全性检查
│   │   ├── analyzer.ts                    # 页面智能分析器
│   │   ├── case-generator.ts              # 测试用例生成器
│   │   ├── failure-analyzer.ts            # 失败原因分析器
│   │   ├── flow-optimizer.ts              # 测试流程优化器
│   │   ├── self-healer.ts                 # 自愈引擎（元素定位修复）
│   │   └── index.ts
│   │
│   ├── crawlers/                          # 页面爬虫/探索器
│   │   ├── web-crawler.ts                 # Web 页面爬取（提取所有链接、表单、交互元素）
│   │   ├── app-crawler.ts                 # APP 页面爬取（遍历 Activity/页面）
│   │   ├── sitemap-parser.ts              # Sitemap 解析
│   │   ├── page-snapshot.ts               # 页面快照（截图 + DOM + 可交互元素列表）
│   │   └── index.ts
│   │
│   ├── testers/                           # 各类测试器
│   │   ├── web/                           # Web 测试（Playwright）
│   │   │   ├── pc-tester.ts               # PC Web 测试器
│   │   │   ├── h5-tester.ts               # H5 移动端 Web 测试器
│   │   │   ├── responsive-tester.ts       # 响应式测试（多视口截图对比）
│   │   │   ├── cross-browser-tester.ts    # 跨浏览器测试
│   │   │   ├── interaction-tester.ts      # 交互测试（点击、输入、导航）
│   │   │   ├── form-tester.ts             # 表单自动测试
│   │   │   ├── navigation-tester.ts       # 导航/路由测试
│   │   │   └── index.ts
│   │   │
│   │   ├── app/                           # APP 测试（Appium）
│   │   │   ├── install-tester.ts          # 安装/卸载测试
│   │   │   ├── launch-tester.ts           # 启动/冷启动/热启动测试
│   │   │   ├── ui-tester.ts               # UI 交互测试
│   │   │   ├── navigation-tester.ts       # 页面导航测试
│   │   │   ├── gesture-tester.ts          # 手势测试（滑动、缩放、长按）
│   │   │   ├── input-tester.ts            # 输入测试
│   │   │   ├── lifecycle-tester.ts        # APP 生命周期（前后台切换、旋转屏幕）
│   │   │   ├── permission-tester.ts       # 权限弹窗测试
│   │   │   ├── notification-tester.ts     # 通知测试
│   │   │   └── index.ts
│   │   │
│   │   ├── performance/                   # 性能测试
│   │   │   ├── web-performance.ts         # Web 性能（Lighthouse + CWV）
│   │   │   ├── app-performance.ts         # APP 性能（启动时间、内存、CPU、FPS）
│   │   │   ├── load-time-tester.ts        # 页面加载时间
│   │   │   ├── network-tester.ts          # 弱网/断网测试
│   │   │   └── index.ts
│   │   │
│   │   ├── visual/                        # 视觉测试
│   │   │   ├── screenshot-tester.ts       # 截图对比
│   │   │   ├── layout-tester.ts           # 布局检查（溢出、重叠、对齐）
│   │   │   ├── text-tester.ts             # 文字检查（截断、溢出、乱码）
│   │   │   ├── color-contrast-tester.ts   # 颜色对比度
│   │   │   ├── baseline-manager.ts        # 基线图管理
│   │   │   └── index.ts
│   │   │
│   │   ├── accessibility/                 # 无障碍测试
│   │   │   ├── a11y-tester.ts             # axe-core 自动检查
│   │   │   ├── keyboard-tester.ts         # 键盘导航测试
│   │   │   ├── screen-reader-tester.ts    # 屏幕阅读器兼容性
│   │   │   └── index.ts
│   │   │
│   │   ├── security/                      # 安全测试
│   │   │   ├── xss-tester.ts              # XSS 注入检测
│   │   │   ├── csrf-tester.ts             # CSRF 检测
│   │   │   ├── header-tester.ts           # 安全头检查
│   │   │   ├── ssl-tester.ts              # SSL/TLS 证书检查
│   │   │   ├── sensitive-data-tester.ts   # 敏感信息泄露检查
│   │   │   ├── dependency-tester.ts       # 依赖漏洞扫描（针对 Web）
│   │   │   └── index.ts
│   │   │
│   │   ├── api/                           # API 接口测试
│   │   │   ├── api-discovery.ts           # API 自动发现（抓取网络请求）
│   │   │   ├── api-tester.ts              # API 功能测试
│   │   │   ├── api-contract-tester.ts     # 接口契约验证
│   │   │   ├── api-stress-tester.ts       # 接口压力测试
│   │   │   └── index.ts
│   │   │
│   │   ├── compatibility/                 # 兼容性测试
│   │   │   ├── browser-compat-tester.ts   # 浏览器兼容（Chrome/Firefox/Safari/Edge）
│   │   │   ├── device-compat-tester.ts    # 设备兼容（不同分辨率/DPR）
│   │   │   ├── os-compat-tester.ts        # 系统版本兼容（Android 各版本）
│   │   │   └── index.ts
│   │   │
│   │   └── stability/                     # 稳定性测试
│   │       ├── monkey-tester.ts           # Monkey 随机操作测试
│   │       ├── long-run-tester.ts         # 长时间运行测试
│   │       ├── memory-leak-tester.ts      # 内存泄漏检测
│   │       ├── crash-detector.ts          # 崩溃检测
│   │       └── index.ts
│   │
│   ├── test-cases/                        # 测试用例管理
│   │   ├── case-manager.ts                # 用例管理器（增删改查）
│   │   ├── case-parser.ts                 # 用例解析器（JSON → 可执行步骤）
│   │   ├── case-recorder.ts              # 用例录制器（录制用户操作 → 生成用例）
│   │   ├── case-store.ts                  # 用例持久化存储
│   │   └── templates/                     # 用例 JSON 模板
│   │       ├── web-smoke.template.json    # Web 冒烟测试模板
│   │       ├── app-smoke.template.json    # APP 冒烟测试模板
│   │       ├── login-flow.template.json   # 登录流程模板
│   │       └── crud-flow.template.json    # 增删改查流程模板
│   │
│   ├── reporters/                         # 报告生成
│   │   ├── report-generator.ts            # 报告生成器（主入口）
│   │   ├── html-reporter.ts              # HTML 报告
│   │   ├── json-reporter.ts              # JSON 数据报告
│   │   ├── markdown-reporter.ts          # Markdown 报告
│   │   ├── console-reporter.ts           # 终端实时输出
│   │   ├── diff-reporter.ts             # 与上次报告对比差异
│   │   ├── trend-reporter.ts             # 趋势分析报告（多次测试对比）
│   │   ├── templates/                     # HTML 报告模板
│   │   │   ├── report.html               # 主报告模板
│   │   │   ├── styles.css                # 报告样式
│   │   │   └── charts.ts                # 图表渲染
│   │   └── index.ts
│   │
│   ├── knowledge/                         # 知识库（AI 自学习）
│   │   ├── test-history.ts                # 测试历史记录
│   │   ├── failure-patterns.ts            # 失败模式库
│   │   ├── element-mapping.ts             # 元素定位映射（自愈用）
│   │   ├── optimization-log.ts            # 优化记录
│   │   ├── best-practices.ts              # 最佳实践积累
│   │   └── db/                            # 数据库模块
│   │       └── index.ts                   # SQLite 数据库管理（支持向量扩展）
│   │
│   ├── utils/                             # 工具函数
│   │   ├── file.ts                        # 文件操作
│   │   ├── image.ts                       # 图片处理（截图对比、压缩）
│   │   ├── network.ts                     # 网络工具（代理、抓包）
│   │   ├── device.ts                      # 设备管理工具
│   │   ├── wait.ts                        # 等待/重试工具
│   │   ├── hash.ts                        # 哈希计算
│   │   ├── sanitize.ts                    # 数据脱敏
│   │   └── index.ts
│   │
│   ├── types/                             # 类型定义
│   │   ├── test-case.types.ts             # 测试用例类型
│   │   ├── test-result.types.ts           # 测试结果类型
│   │   ├── report.types.ts               # 报告类型
│   │   ├── config.types.ts                # 配置类型
│   │   ├── ai.types.ts                    # AI 相关类型
│   │   ├── crawler.types.ts               # 爬虫相关类型
│   │   ├── device.types.ts                # 设备相关类型
│   │   └── index.ts
│   │
│   └── web-ui/                            # 可视化面板（可选，后期）
│       ├── server.ts                      # 本地 Web 服务
│       └── pages/                         # 简单的报告查看页面
│
├── db/                                    # 项目数据库（SQLite + 向量扩展）
│   ├── sqlite.db                          # 主数据库（测试结果、知识库）
│   └── ext/                               # SQLite 向量扩展（用于 AI 语义搜索）
│       ├── windows/vec0.dll               # Windows 向量扩展
│       ├── linux/vec0.so                  # Linux 向量扩展
│       └── macos/vec0.so                  # macOS 向量扩展
│
├── test-suites/                           # 用户的测试套件存储目录
│   ├── .gitkeep
│   └── example/                           # 示例项目
│       ├── config.json                    # 项目测试配置
│       ├── cases/                         # 该项目的测试用例
│       └── reports/                       # 该项目的测试报告
│
├── data/                                  # 运行时数据
│   ├── screenshots/                       # 截图存储
│   ├── videos/                            # 录屏存储
│   ├── baselines/                         # 视觉基线图
│   ├── apks/                              # APK 存储
│   ├── logs/                              # 运行日志
│   └── reports/                           # 生成的报告
│
├── scripts/                               # 辅助脚本
│   ├── setup-android.ts                   # 安卓环境检查与设置
│   ├── setup-browsers.ts                  # 浏览器安装
│   ├── db-migrate.ts                      # 数据库迁移脚本
│   └── clean.ts                           # 清理临时数据
│
├── tests/                                 # 框架自身的测试
│   ├── unit/
│   │   ├── ai/
│   │   ├── crawlers/
│   │   ├── testers/
│   │   └── reporters/
│   └── integration/
│       ├── web-flow.test.ts
│       └── report-flow.test.ts
│
└── docs/                                  # 补充文档
    ├── architecture.md                    # 架构说明
    ├── ai-prompts.md                     # AI Prompt 设计说明
    └── extending.md                       # 如何扩展新的测试器
```

## 🛠️ 技术栈（必须使用）

| 类别 | 技术 | 理由 |
|------|------|------|
| 语言 | TypeScript 5.x strict | 类型安全 |
| Web 自动化 | Playwright | 跨浏览器 + 移动模拟 + 截图/录屏 + 网络拦截 |
| APP 自动化 | Appium 2 + WebDriverIO | Android 自动化标准 |
| 性能测试 | Lighthouse CI + Playwright | Web 性能分析 |
| 无障碍测试 | axe-core + Playwright | WCAG 标准检测 |
| 视觉对比 | pixelmatch / resemble.js | 像素级截图对比 |
| API 测试 | 原生 fetch + Zod | 接口请求 + 契约校验 |
| AI 客户端 | Anthropic SDK / OpenAI SDK | 多模型支持 |
| CLI | Commander.js + Inquirer | 命令行交互 |
| 本地数据库 | better-sqlite3 + vec0 | 存储测试历史/知识库 + 向量搜索 |
| 报告模板 | Handlebars | HTML 报告生成 |
| 图表 | ECharts（嵌入报告HTML） | 数据可视化 |
| 日志 | pino | 高性能日志 |
| 任务调度 | node-cron | 定时测试 |
| 文件监听 | chokidar | 监听配置/用例变化 |
| 终端美化 | chalk + ora + cli-table3 | 终端输出美化 |
| 框架自测 | vitest | 框架自身单元测试 |
| 运行时 | tsx | 直接运行 TS |
| 构建 | tsup | 打包发布 |

## ⚡ 核心命令（最终实现目标）

```bash
# ===== 一键测试命令（产品经理直接用）=====

# 测试网站（自动判断 PC + H5）
npx autotest web https://example.com

# 测试网站（仅 PC）
npx autotest web https://example.com --platform pc

# 测试网站（仅 H5 移动端）
npx autotest web https://example.com --platform h5

# 测试 APP（提供 APK 路径）
npx autotest app ./my-app.apk

# 测试 APP（提供已安装的包名）
npx autotest app --package com.example.myapp

# 测试 API（提供 base URL）
npx autotest api https://api.example.com/v1

# 全部测试（Web + APP + API）
npx autotest all --config ./test-suites/myproject/config.json

# ===== 测试选项 =====

# 指定测试类型
npx autotest web https://example.com --type smoke          # 冒烟测试（快速）
npx autotest web https://example.com --type full           # 全量测试（完整）
npx autotest web https://example.com --type regression     # 回归测试（对比上次）
npx autotest web https://example.com --type performance    # 性能专项测试
npx autotest web https://example.com --type security       # 安全专项测试
npx autotest web https://example.com --type accessibility  # 无障碍专项测试
npx autotest web https://example.com --type visual         # 视觉回归测试
npx autotest web https://example.com --type monkey         # Monkey 随机测试

# 指定浏览器
npx autotest web https://example.com --browser chrome,firefox,safari

# 指定设备模拟
npx autotest web https://example.com --device "iPhone 15,Pixel 7,iPad Pro"

# 设置测试深度（AI 探索页面的深度）
npx autotest web https://example.com --depth 3

# 设置超时时间（分钟）
npx autotest web https://example.com --timeout 30

# 需要登录的网站
npx autotest web https://example.com --login-url /login --username admin --password 123456

# 生成报告格式
npx autotest web https://example.com --report html,json,markdown

# ===== AI 优化命令 =====

# AI 分析上次测试结果并优化测试用例
npx autotest optimize --project myproject

# AI 分析失败用例并给出修复建议
npx autotest analyze-failures --project myproject

# 根据 AI 建议自动更新测试用例
npx autotest optimize --project myproject --auto-apply

# ===== 报告与历史 =====

# 查看最新报告（自动在浏览器打开）
npx autotest report --latest

# 查看历史报告列表
npx autotest report --list

# 对比两次报告
npx autotest report --diff run-001 run-002

# 查看趋势分析
npx autotest report --trend --last 10

# ===== 录制与用例管理 =====

# 录制用户操作（生成测试用例）
npx autotest record https://example.com

# 录制 APP 操作
npx autotest record --app ./my-app.apk

# 查看已有测试用例
npx autotest cases --list --project myproject

# ===== 定时测试 =====

# 每天早上 9 点自动测试
npx autotest schedule --cron "0 9 * * *" --config ./test-suites/myproject/config.json

# ===== 环境 =====

# 检查环境是否就绪
npx autotest doctor

# 安装浏览器驱动
npx autotest setup

# 清理临时数据
npx autotest clean

# ===== 开发/调试 =====

npm run dev                    # 开发模式（tsx watch）
npm run build                  # 构建
npm run test:self              # 运行框架自身测试
npm run test:self:coverage     # 框架自身测试覆盖率
npm run lint                   # ESLint 检查
npm run lint:fix               # ESLint 修复
npm run format                 # Prettier 格式化
npm run typecheck              # TypeScript 类型检查
npm run db:migrate             # 数据库迁移（从旧版迁移）
npm run db:init                # 初始化数据库
```

## 🗄️ 数据库设计

### 数据库位置
- **主数据库**: `db/sqlite.db` - 存储所有测试结果、知识库数据
- **向量扩展**: `db/ext/` - SQLite 向量扩展，用于 AI 语义搜索

### 平台分类存储
测试结果按平台分类存储，支持以下平台：
- `pc-web` - PC 桌面端 Web 测试
- `h5-web` - H5 移动端 Web 测试
- `android-app` - Android APP 测试
- `api` - API 接口测试

### 核心表结构

#### test_runs（测试运行记录）
```sql
CREATE TABLE test_runs (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  platform TEXT NOT NULL,              -- 'pc-web' | 'h5-web' | 'android-app' | 'api'
  test_type TEXT DEFAULT 'full',       -- 'smoke' | 'full' | 'performance' | 'security'
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_ms INTEGER DEFAULT 0,
  total_cases INTEGER DEFAULT 0,
  passed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  blocked INTEGER DEFAULT 0,
  pass_rate REAL DEFAULT 0,
  status TEXT DEFAULT 'running',
  -- 平台特定环境信息
  browser TEXT,
  device TEXT,
  os TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  app_version TEXT,
  app_package TEXT,
  -- AI 分析
  ai_analysis TEXT,
  risk_level TEXT,
  created TEXT NOT NULL
);
```

#### test_results（测试用例结果）
```sql
CREATE TABLE test_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  case_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  test_category TEXT DEFAULT 'functional',
  status TEXT NOT NULL,
  priority TEXT DEFAULT 'P2',
  duration_ms INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  ai_error_analysis TEXT,
  self_healed INTEGER DEFAULT 0,
  embedding BLOB,                      -- 向量嵌入（用于语义搜索）
  FOREIGN KEY (run_id) REFERENCES test_runs(id)
);
```

#### element_mappings（元素定位映射）
```sql
CREATE TABLE element_mappings (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  platform TEXT NOT NULL,              -- 区分不同平台的元素
  page_url TEXT NOT NULL,
  element_name TEXT,
  original_selector TEXT NOT NULL,
  alternative_selectors TEXT,
  last_working_selector TEXT,
  selector_type TEXT DEFAULT 'css',
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0,
  embedding BLOB,                      -- 用于语义匹配元素
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
```

### 向量扩展功能
当向量扩展可用时，支持以下 AI 增强功能：
- **语义搜索测试用例**: 根据描述搜索相似的测试用例
- **智能元素匹配**: 根据元素描述自动找到最佳选择器
- **失败模式聚类**: 自动归类相似的失败模式
- **测试推荐**: 根据历史数据推荐应执行的测试

### 数据库操作命令
```bash
# 初始化数据库
npm run db:init

# 从旧版迁移数据
npm run db:migrate

# 查看数据库统计
npx tsx -e "
import { getDatabase } from './src/knowledge/db/index.js';
const db = getDatabase();
await db.initialize();
console.log(db.getStats());
db.close();
"
```

## 📝 代码规范

### 1. TypeScript 严格模式
- `tsconfig.json` 开启 `strict: true`
- 禁止 `any`，使用具体类型或 `unknown`
- 所有导出函数必须有返回类型注解
- 所有对外接口用 `interface` 或 `type` 定义

### 2. 命名规范
| 类别 | 规范 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `web-crawler.ts` `form-tester.ts` |
| 类名 | PascalCase | `WebCrawler` `FormTester` |
| 接口/类型 | PascalCase | `TestCase` `TestResult` |
| 函数/变量 | camelCase | `runTests` `pageSnapshot` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 枚举 | PascalCase + UPPER_SNAKE 成员 | `enum TestStatus { PASSED, FAILED }` |
| 测试器类 | PascalCase + Tester 后缀 | `FormTester` `XssTester` |
| Prompt 文件 | kebab-case + .prompt.ts | `analyze-page.prompt.ts` |

### 3. 导入顺序
```typescript
// 1. Node.js 内置
import path from 'node:path';
import fs from 'node:fs/promises';

// 2. 第三方库
import { chromium } from 'playwright';
import { z } from 'zod';

// 3. 项目内部
import { logger } from '@/core/logger';
import { AiAnalyzer } from '@/ai/analyzer';
import { WebCrawler } from '@/crawlers/web-crawler';

// 4. 类型导入
import type { TestCase, TestResult } from '@/types';
```

### 4. 路径别名
- `@/` → `src/`
- 在 `tsconfig.json` 中配置

### 5. 测试用例 JSON 格式规范
```jsonc
// test-suites/myproject/cases/login-test.case.json
{
  "id": "tc-login-001",
  "name": "用户登录流程测试",
  "description": "验证用户可以使用邮箱和密码成功登录",
  "priority": "P0",                    // P0=阻塞 P1=严重 P2=一般 P3=轻微
  "type": "functional",               // functional | visual | performance | security | accessibility
  "platform": ["pc-web", "h5-web"],   // pc-web | h5-web | android-app
  "tags": ["login", "auth", "smoke"],
  "preconditions": [
    "用户已注册账号 test@example.com"
  ],
  "steps": [
    {
      "order": 1,
      "action": "navigate",
      "target": "/login",
      "description": "打开登录页面"
    },
    {
      "order": 2,
      "action": "fill",
      "target": "input[name='email']",
      "value": "test@example.com",
      "description": "输入邮箱"
    },
    {
      "order": 3,
      "action": "fill",
      "target": "input[name='password']",
      "value": "Test123456",
      "description": "输入密码"
    },
    {
      "order": 4,
      "action": "click",
      "target": "button[type='submit']",
      "description": "点击登录按钮"
    },
    {
      "order": 5,
      "action": "assert",
      "type": "url-contains",
      "value": "/dashboard",
      "description": "验证跳转到首页"
    },
    {
      "order": 6,
      "action": "assert",
      "type": "element-visible",
      "target": "[data-testid='user-avatar']",
      "description": "验证用户头像显示"
    }
  ],
  "cleanup": [
    {
      "action": "click",
      "target": "[data-testid='logout-button']",
      "description": "退出登录"
    }
  ],
  "metadata": {
    "author": "AI Auto-Generated",
    "created": "2024-01-01T00:00:00Z",
    "updated": "2024-01-01T00:00:00Z",
    "ai_confidence": 0.92,
    "run_count": 5,
    "pass_rate": 0.8,
    "avg_duration_ms": 3500,
    "last_result": "passed",
    "optimization_notes": "第3步等待时间从2s优化到1s，稳定通过"
  }
}
```

### 6. 项目测试配置文件规范
```jsonc
// test-suites/myproject/config.json
{
  "project": {
    "name": "我的项目",
    "description": "项目描述"
  },
  "targets": {
    "web": {
      "url": "https://example.com",
      "loginUrl": "/login",
      "credentials": {
        "username": "admin",
        "password": "env:TEST_PASSWORD"    // 从环境变量读取
      }
    },
    "h5": {
      "url": "https://m.example.com",
      "devices": ["iPhone 15", "Pixel 7"]
    },
    "app": {
      "apkPath": "./data/apks/my-app.apk",
      "packageName": "com.example.myapp",
      "mainActivity": ".MainActivity"
    },
    "api": {
      "baseUrl": "https://api.example.com/v1",
      "authToken": "env:API_TOKEN"
    }
  },
  "settings": {
    "testDepth": 3,                        // AI 探索深度
    "timeout": 30000,                      // 单步超时 ms
    "retryCount": 2,                       // 失败重试次数
    "parallelism": 3,                      // 并行度
    "screenshotOnFailure": true,           // 失败时截图
    "videoOnFailure": true,                // 失败时录屏
    "enableAiOptimization": true,          // 启用 AI 自优化
    "reportFormats": ["html", "json"],     // 报告格式
    "notifyOnComplete": {                  // 完成通知
      "email": "pm@example.com",
      "webhook": "https://hooks.slack.com/xxx"
    }
  },
  "schedule": {
    "enabled": false,
    "cron": "0 9 * * 1-5"                // 工作日每天 9 点
  }
}
```

### 7. 测试结果数据结构
```typescript
interface TestRunResult {
  runId: string;                          // 运行 ID
  project: string;                        // 项目名
  startTime: string;                      // 开始时间
  endTime: string;                        // 结束时间
  duration: number;                       // 总耗时 ms
  platform: 'pc-web' | 'h5-web' | 'android-app' | 'api';
  environment: {
    browser?: string;
    device?: string;
    os?: string;
    viewport?: { width: number; height: number };
  };
  summary: {
    total: number;                        // 总用例数
    passed: number;
    failed: number;
    skipped: number;
    blocked: number;
    passRate: number;                     // 通过率 0-1
  };
  categories: {
    functional: CategoryResult;
    visual: CategoryResult;
    performance: PerformanceResult;
    security: SecurityResult;
    accessibility: AccessibilityResult;
    compatibility: CategoryResult;
    stability: CategoryResult;
  };
  cases: TestCaseResult[];                // 每个用例的详细结果
  aiAnalysis: {
    overallAssessment: string;            // AI 总体评价
    criticalIssues: string[];             // 关键问题
    recommendations: string[];            // 改进建议
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  artifacts: {
    screenshots: string[];               // 截图文件路径
    videos: string[];                     // 录屏文件路径
    logs: string[];                       // 日志文件路径
  };
}
```

### 8. AI Prompt 编写规范
```typescript
// src/ai/prompts/analyze-page.prompt.ts

export function buildAnalyzePagePrompt(params: {
  url: string;
  html: string;
  screenshot: string;                    // base64
  interactiveElements: ElementInfo[];
  platform: 'pc' | 'h5';
}): string {
  return `
你是一位资深的QA测试专家。请分析以下页面，识别所有可测试的功能点。

## 页面信息
- URL: ${params.url}
- 平台: ${params.platform === 'pc' ? 'PC桌面端' : 'H5移动端'}

## 页面HTML结构（精简版）
\`\`\`html
${params.html}
\`\`\`

## 可交互元素列表
${JSON.stringify(params.interactiveElements, null, 2)}

## 请输出以下内容（JSON格式）：
1. 页面功能描述（一句话）
2. 可测试功能点列表（每个包含：名称、优先级P0-P3、测试步骤）
3. 潜在风险点
4. 建议的测试数据

请用中文回答，输出严格的JSON格式。
`.trim();
}
```

### 9. 自愈机制规范
```typescript
// 当元素定位失败时，AI 自愈引擎自动执行以下流程：
// 1. 截图当前页面
// 2. 查询知识库，该元素历史定位方式
// 3. 发送截图 + DOM 给 AI，请求新的定位方式
// 4. 用新定位重试
// 5. 成功则更新知识库映射
// 6. 失败则标记需人工介入

// 知识库元素映射格式
interface ElementMapping {
  originalSelector: string;              // 原始选择器
  alternativeSelectors: string[];        // 备选选择器列表
  lastWorkingSelector: string;           // 上次成功的选择器
  lastUpdated: string;                   // 最后更新时间
  aiSuggested: boolean;                  // 是否 AI 建议
  successCount: number;                  // 成功次数
  failureCount: number;                  // 失败次数
}
```

### 10. 报告输出规范
```
HTML 报告必须包含以下章节：

1. 📊 测试概览
   - 项目名称、测试时间、总耗时
   - 通过率饼图
   - 各类别测试结果摘要

2. 🔴 关键问题（P0/P1 失败项）
   - 问题描述
   - 失败截图
   - 重现步骤
   - AI 分析的可能原因
   - 修复建议

3. 📋 详细结果
   - 按类别分组的所有测试结果
   - 每个用例：状态、耗时、截图、日志

4. 📈 性能数据
   - Lighthouse 评分
   - Core Web Vitals
   - 加载时间瀑布图

5. 🔒 安全检查
   - 发现的安全问题及严重级别

6. ♿ 无障碍检查
   - WCAG 违规项

7. 📱 兼容性矩阵
   - 各浏览器/设备的通过情况矩阵表

8. 📈 趋势对比
   - 与上次测试结果的对比
   - 新增/修复/仍存在的问题

9. 🤖 AI 建议
   - 总体质量评估
   - 改进优先级建议
   - 测试流程优化建议

所有内容必须是中文。
报告要非技术人员（产品经理）看得懂。
```

### 11. 环境变量规范
```bash
# .env.example

# ===== AI 模型配置 =====
AI_PROVIDER=anthropic                     # anthropic | openai | local
AI_API_KEY=                               # AI API 密钥
AI_MODEL=claude-sonnet-4-20250514            # 模型名称
AI_MAX_TOKENS=4096                        # 最大输出 token

# ===== Appium 配置 =====
APPIUM_HOST=127.0.0.1
APPIUM_PORT=4723
ANDROID_HOME=                             # Android SDK 路径

# ===== 通知配置 =====
NOTIFY_EMAIL=                             # 邮件通知（可选）
NOTIFY_WEBHOOK=                           # Webhook 通知（可选）
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

# ===== 代理配置 =====
HTTP_PROXY=                               # HTTP 代理（可选）
HTTPS_PROXY=                              # HTTPS 代理（可选）

# ===== 测试账号（不要硬编码到用例中）=====
TEST_USERNAME=
TEST_PASSWORD=
API_TOKEN=

# ===== 存储配置 =====
DATA_DIR=./data                           # 数据存储目录
MAX_SCREENSHOTS=1000                      # 最大截图保留数
MAX_REPORTS=50                            # 最大报告保留数
```

### 12. 错误处理规范
```typescript
// 自定义错误类
export class TestError extends Error {
  constructor(
    message: string,
    public readonly code: TestErrorCode,
    public readonly context?: Record<string, unknown>,
    public readonly screenshot?: string,     // 截图路径
    public readonly recoverable: boolean = false,
  ) {
    super(message);
    this.name = 'TestError';
  }
}

export enum TestErrorCode {
  // 环境错误
  BROWSER_LAUNCH_FAILED = 'BROWSER_LAUNCH_FAILED',
  APPIUM_CONNECTION_FAILED = 'APPIUM_CONNECTION_FAILED',
  DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND',

  // 测试执行错误
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',       // → 触发自愈
  NAVIGATION_TIMEOUT = 'NAVIGATION_TIMEOUT',
  ASSERTION_FAILED = 'ASSERTION_FAILED',
  ACTION_FAILED = 'ACTION_FAILED',

  // AI 错误
  AI_API_FAILED = 'AI_API_FAILED',
  AI_PARSE_FAILED = 'AI_PARSE_FAILED',

  // 配置错误
  INVALID_CONFIG = 'INVALID_CONFIG',
  MISSING_DEPENDENCY = 'MISSING_DEPENDENCY',
}
```

### 13. 日志规范
```typescript
import { logger } from '@/core/logger';

// 测试执行日志
logger.info('🚀 开始测试', { project: 'myapp', platform: 'pc-web' });
logger.step('📍 第1步: 打开登录页面', { url: '/login' });
logger.pass('✅ 断言通过: 页面标题正确');
logger.fail('❌ 断言失败: 元素未找到', { selector: '#submit-btn', screenshot: 'path.png' });
logger.warn('⚠️ 元素定位降级: 使用备选选择器', { original: '#old', fallback: '.new' });
logger.ai('🤖 AI 分析中...', { prompt: 'analyze-page' });
logger.perf('📊 性能数据', { lcp: 1200, fid: 50, cls: 0.05 });
```

## 🔄 AI 自优化工作流

```
第一次测试:
1. 用户提供 URL/APK
2. 爬虫探索所有页面/页面
3. AI 分析每个页面，生成测试用例（JSON）
4. 执行所有测试用例
5. 收集结果 + 截图 + 日志
6. AI 生成中文测试报告
7. 保存到知识库

后续测试（自优化循环）:
1. 读取知识库中的历史数据
2. AI 分析哪些用例常失败 → 调整等待时间/选择器
3. AI 分析哪些页面没覆盖 → 补充新用例
4. AI 分析哪些用例价值低 → 降低优先级或跳过
5. 执行优化后的用例集
6. 对比本次与上次结果 → 生成趋势报告
7. 更新知识库

核心目标：测试越跑越智能、越跑越稳定、覆盖越来越全
```
```

---


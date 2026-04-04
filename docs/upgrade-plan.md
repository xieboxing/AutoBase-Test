# AutoBase-Test 智能化升级计划与差距分析

> 本文档基于 2026-04-04 项目现状盘点，为后续智能化升级提供清晰的路线图。
>
> 目标：让 AutoBase-Test 从"能自动执行测试"升级为"会基于历史学习、主动优化、可持续积累知识的 AI 测试智能体"。

---

## 一、项目现状总览

### 1.1 已实现的核心能力

| 模块类别 | 已有能力 | 实现程度 | 文件路径 |
|---------|---------|---------|---------|
| **核心引擎** | 测试编排器 (Orchestrator) | ✅ 完整实现 | `src/core/orchestrator.ts` |
| | 测试执行器 (TestRunner) | ✅ 完整实现 | `src/core/test-runner.ts` |
| | 事件总线 (EventBus) | ✅ 完整实现 | `src/core/event-bus.ts` |
| | 日志系统 (Logger) | ✅ 完整实现 | `src/core/logger.ts` |
| | 错误处理 (ErrorHandler) | ✅ 完整实现 | `src/core/error-handler.ts` |
| **AI 模块** | AI 客户端 (多模型支持) | ✅ 完整实现 | `src/ai/client.ts` |
| | 测试用例生成器 (CaseGenerator) | ✅ 完整实现 | `src/ai/case-generator.ts` |
| | 自愈引擎 (SelfHealer) | ⚠️ 内存级实现 | `src/ai/self-healer.ts` |
| | 失败分析器 (FailureAnalyzer) | ✅ 完整实现 | `src/ai/failure-analyzer.ts` |
| | 流程优化器 (FlowOptimizer) | ⚠️ 内存级实现 | `src/ai/flow-optimizer.ts` |
| | 页面分析器 (PageAnalyzer) | ✅ 完整实现 | `src/ai/analyzer.ts` |
| **爬虫模块** | Web 爬虫 | ✅ 完整实现 | `src/crawlers/web-crawler.ts` |
| | APP 爬虫 | ✅ 完整实现 | `src/crawlers/app-crawler.ts` |
| | 页面快照 | ✅ 完整实现 | `src/crawlers/page-snapshot.ts` |
| **知识库** | 数据库管理 (SQLite) | ✅ 完整实现 | `src/knowledge/db/index.ts` |
| | 测试历史记录 | ✅ 完整实现 | `src/knowledge/test-history.ts` |
| | 失败模式库 | ⚠️ 基础实现 | `src/knowledge/failure-patterns.ts` |
| | 元素定位映射 | ⚠️ 内存级实现 | `src/ai/self-healer.ts` 内部 |
| | 优化记录 | ⚠️ 内存级实现 | `src/knowledge/optimization-log.ts` |
| **报告生成** | HTML 报告 | ✅ 完整实现 | `src/reporters/html-reporter.ts` |
| | JSON 报告 | ✅ 完整实现 | `src/reporters/json-reporter.ts` |
| | Markdown 报告 | ✅ 完整实现 | `src/reporters/markdown-reporter.ts` |
| | 趋势报告 | ✅ 完整实现 | `src/reporters/trend-reporter.ts` |
| **CLI** | 命令行工具 | ✅ 完整实现 | `src/cli/index.ts` |

### 1.2 技术栈符合度

| 要求 | 实际情况 | 符合度 |
|------|---------|-------|
| TypeScript strict | ✅ 已启用 | 100% |
| 禁止 any | ✅ 代码规范遵守 | 95% |
| better-sqlite3 同步 API | ✅ 已实现适配器 | 100% |
| AI 不可用时降级 | ✅ 各模块均有降级 | 100% |
| EventBus 机制 | ✅ 已实现 | 100% |
| JSDoc 注释 | ⚠️ 部分缺失 | 70% |

---

## 二、模块详细差距分析

### 2.1 核心引擎层

#### `src/core/orchestrator.ts` - 测试编排器

**已有能力：**
- ✅ 完整的测试流程编排（初始化 → 探索 → 生成 → 执行 → 报告）
- ✅ 支持多平台测试（PC Web / H5 Web）
- ✅ 与爬虫、AI、报告模块集成
- ✅ 事件发射（test:start, test:complete 等）

**缺口分析：**
- ❌ **无历史知识加载**：执行前不读取历史测试结果、失败模式、优化建议
- ❌ **无智能调度**：用例执行顺序是硬编码优先级排序，未考虑风险分、稳定性等
- ❌ **无降频策略**：稳定用例不会自动降频跳过
- ❌ **无并发执行**：`parallelism: 1` 硬编码，未实现 Worker 并发
- ❌ **无状态图谱集成**：不记录页面状态转移，无替代路径兜底
- ❌ **无业务流分析阶段**：只生成元素级用例，不生成业务流级用例

**推荐改造点：**
1. 在 `run()` 起始阶段调用 `KnowledgeBase.loadHistoricalContext()`
2. 引入 `TestScheduler` 模块统一调度用例
3. 在失败时调用 `FailurePatternLibrary.matchAndFix()`
4. 支持 `parallelism > 1` 时走 `ParallelRunner`

---

#### `src/core/event-bus.ts` - 事件总线

**已有能力：**
- ✅ 类型安全的事件发射/监听
- ✅ 预定义 20+ 事件类型
- ✅ `waitFor()` Promise 支持

**缺口分析：**
- ❌ **缺少智能化升级相关事件**：
  - `KNOWLEDGE_LOADED` - 历史知识加载完成
  - `SCHEDULER_DECISION` - 调度器决策
  - `FAILURE_PATTERN_MATCHED` - 失败模式命中
  - `RAG_RETRIEVED` - RAG 记忆召回
  - `VISUAL_DIFF` - 视觉对比结果
  - `WORKER_MESSAGE` - Worker 通信
  - `STATE_GRAPH_TRANSITION` - 状态图谱转移
  - `EXPLORATION_REWARD` - 探索奖励

**推荐改造点：**
1. 扩展 `TestEventType` 枚举
2. 扩展 `TestEventMap` 类型映射

---

### 2.2 AI 智能模块层

#### `src/ai/case-generator.ts` - 测试用例生成器

**已有能力：**
- ✅ 基于页面快照生成测试用例
- ✅ 支持 AI 和规则引擎双模式
- ✅ 生成冒烟测试、功能测试、表单测试、导航测试

**缺口分析：**
- ❌ **无历史上下文输入**：不接收上次通过/失败用例列表
- ❌ **无覆盖薄弱点注入**：不知道哪些功能区域历史覆盖低
- ❌ **无业务流理解**：只生成元素级操作，不生成端到端业务流

**推荐改造点：**
1. 扩展 `generateFromSnapshot()` 参数，接收 `HistoricalContext`
2. 新增 `BusinessFlowAnalyzer` 模块
3. 扩展 Prompt 模板，加入历史上下文字段

---

#### `src/ai/self-healer.ts` - 自愈引擎

**已有能力：**
- ✅ 三层自愈策略：历史映射 → 相似度匹配 → AI 分析
- ✅ 元素特征提取和相似度计算
- ✅ AI Prompt 构建和结果解析

**缺口分析：**
- ❌ **仅内存存储**：`elementMappings` 是 `Map<string, ElementMapping>`，重启后丢失
- ❌ **无数据库持久化**：未调用 `KnowledgeDatabase` 读写映射
- ❌ **无 RAG 增强**：不检索相似历史自愈案例

**推荐改造点：**
1. 构造函数中调用 `loadFromDatabase()`
2. `updateMapping()` 后立即持久化到数据库
3. 在自愈前先检索 RAG 记忆库

---

#### `src/ai/failure-analyzer.ts` - 失败分析器

**已有能力：**
- ✅ AI 分析和规则引擎双模式
- ✅ 失败分类（element-not-found, timeout, assertion-failed 等）
- ✅ 自动修复判断逻辑

**缺口分析：**
- ❌ **无失败模式库集成**：不查询历史高频失败模式
- ❌ **无自动修复执行**：只判断 `autoFixable`，不执行修复
- ❌ **无 RAG 增强**：不检索相似历史失败案例
- ❌ **分析结果不持久化**：不回写知识库

**推荐改造点：**
1. 分析前先查询 `FailurePatternLibrary.matchPattern()`
2. 高频模式（frequency > 3）直接返回，绕过 AI
3. 分析后回写失败模式库

---

#### `src/ai/flow-optimizer.ts` - 流程优化器

**已有能力：**
- ✅ AI 和规则引擎双模式
- ✅ 优化建议生成（增加超时、调整等待、添加重试等）
- ✅ 自动应用高置信度建议

**缺口分析：**
- ❌ **仅内存存储**：`historyData` 是 `Map<string, CaseHistoryData>`
- ❌ **无数据库持久化**：优化建议不回写知识库
- ❌ **无闭环机制**：下次运行不会自动读取并应用历史建议

**推荐改造点：**
1. 构造函数中从数据库加载历史数据
2. `optimize()` 后将高置信度建议持久化
3. Orchestrator 在 `run()` 末尾调用优化并持久化

---

### 2.3 知识库层

#### `src/knowledge/db/index.ts` - 数据库管理

**已有能力：**
- ✅ 支持 better-sqlite3 和 sql.js 双引擎
- ✅ 完整的表结构（test_runs, test_results, element_mappings, failure_patterns 等）
- ✅ 平台分类存储（pc-web, h5-web, android-app, api）
- ✅ 向量扩展预留（vec0.dll/so）

**缺口分析：**
- ❌ **缺少本轮升级所需表**：
  - `case_statistics` - 用例历史统计（pass rate, 连续通过次数, 稳定性分数）
  - `scheduler_decisions` - 调度决策记录（风险分, 跳过计数）
  - `rag_memories` - RAG 长期记忆（上下文, 执行结果, 解决策略, embedding）
  - `business_flows` - 业务流结构（步骤序列, 页面依赖）
  - `state_graph_nodes` / `state_graph_edges` - 状态图谱
- ❌ **缺少统一数据访问层**：业务模块直接散落 SQL

**推荐改造点：**
1. 新增表结构（幂等迁移）
2. 在 `src/knowledge/` 下新增 `repository.ts` 封装查询

---

#### `src/knowledge/test-history.ts` - 测试历史记录

**已有能力：**
- ✅ 保存/查询测试运行结果
- ✅ 用例历史结果查询
- ✅ 项目统计和趋势数据

**缺口分析：**
- ❌ **缺少用例级统计**：无 `getCaseStatistics()` 方法
- ❌ **缺少稳定性分数计算**：无连续通过次数、稳定状态标记
- ❌ **缺少覆盖薄弱区域分析**：无 `getUncoveredFeatures()`

**推荐改造点：**
1. 新增 `getCaseStatistics(caseId)` 方法
2. 新增 `getStableCases(project, threshold)` 方法
3. 新增 `getUncoveredFeatures(project)` 方法

---

#### `src/knowledge/failure-patterns.ts` - 失败模式库

**已有能力：**
- ✅ 记录失败模式
- ✅ 按类型、频率查询
- ✅ 更新分析结果（rootCause, solution）

**缺口分析：**
- ❌ **缺少自动修复配置**：无 `autoFixConfig` 字段
- ❌ **缺少规则匹配优先逻辑**：不与 `FailureAnalyzer` 集成
- ❌ **缺少 resolvedCount 统计**：不知道修复成功次数

**推荐改造点：**
1. 新增 `auto_fix_config` 字段（JSON）
2. 新增 `resolved_count` 字段
3. 新增 `matchAndApplyFix(errorContext)` 方法

---

#### `src/knowledge/element-mapping.ts` - 元素定位映射

**当前状态：** ⚠️ 该文件已存在但未在知识库中实现

**已有能力（在 self-healer.ts 内存中）：**
- ✅ 元素映射数据结构
- ✅ 成功/失败计数

**缺口分析：**
- ❌ **未持久化到数据库**：虽然有表结构，但未实现读写方法
- ❌ **无跨项目/平台隔离**：不区分项目

**推荐改造点：**
1. 实现独立的 `ElementMappingRepository` 类
2. 提供 `load()`, `save()`, `getBySelector()` 等方法
3. SelfHealer 调用此 Repository 持久化

---

### 2.4 类型定义层

#### `src/types/` - 类型定义目录

**已有能力：**
- ✅ 完整的测试用例、结果、报告类型
- ✅ AI、爬虫、设备类型

**缺口分析：**
- ❌ **缺少本轮升级所需类型**：
  - `HistoricalContext` - 历史上下文
  - `ScheduleResult` - 调度结果
  - `FailurePatternMatch` - 失败模式匹配
  - `AutoFixConfig` - 自动修复配置
  - `RagMemory` - RAG 记忆
  - `StateGraph` 相关 - 状态图谱
  - `BusinessFlow` - 业务流
  - `VisualRegressionResult` - 视觉回归
  - `WorkerMessage` - Worker 通信

**推荐改造点：**
1. 新增 `src/types/knowledge.types.ts`
2. 新增 `src/types/scheduler.types.ts`
3. 新增 `src/types/rag.types.ts`
4. 新增 `src/types/state-graph.types.ts`
5. 新增 `src/types/worker.types.ts`

---

### 2.5 报告生成层

#### `src/reporters/` - 报告生成器

**已有能力：**
- ✅ 多格式报告（HTML, JSON, Markdown, Console）
- ✅ 趋势报告、对比报告
- ✅ 中文输出

**缺口分析：**
- ❌ **缺少新能力展示**：
  - 历史知识加载与本次策略
  - 调度策略与风险分
  - 失败模式命中与自动修复结果
  - RAG 召回记忆摘要
  - 视觉回归结果
  - 并发执行概况
  - 状态图谱摘要
  - 业务流测试结果
  - 探索式测试发现

**推荐改造点：**
1. 扩展 `TestRunResult` 类型，新增字段
2. 更新 HTML 报告模板，新增章节
3. 更新 JSON/Markdown 报告结构

---

### 2.6 CLI 层

#### `src/cli/` - 命令行工具

**已有能力：**
- ✅ 完整的命令体系（web, app, api, all, optimize, report, record, doctor, init, schedule, setup, clean）
- ✅ 选项解析和帮助信息

**缺口分析：**
- ❌ **缺少 explore 命令**：探索式混沌测试模式
- ❌ **缺少视觉回归选项**：`--visual-baseline`, `--visual-compare`
- ❌ **缺少并发选项**：`--parallel`
- ❌ **缺少 RAG 相关配置**：AI 配置中无 Embedding 相关

**推荐改造点：**
1. 新增 `src/cli/commands/explore.ts`
2. 扩展 web/app 命令选项
3. 更新配置类型

---

## 三、关键缺口优先级矩阵

| 缺口类别 | 影响范围 | 实现难度 | 优先级 | 对应 Phase |
|---------|---------|---------|-------|-----------|
| 历史知识加载 | 高 | 低 | P0 | Phase 1 |
| 用例级统计查询 | 高 | 低 | P0 | Phase 1 |
| 元素映射持久化 | 高 | 低 | P0 | Phase 1 |
| 失败模式库集成 | 高 | 中 | P1 | Phase 3 |
| 智能调度器 | 高 | 中 | P1 | Phase 2 |
| RAG 记忆引擎 | 中 | 高 | P1+ | Phase 4 |
| 状态图谱构建 | 中 | 高 | P2 | Phase 5 |
| 视觉回归基线 | 中 | 中 | P2 | Phase 6 |
| 并发执行框架 | 高 | 高 | P2 | Phase 7 |
| 业务流理解 | 低 | 高 | P3 | Phase 8 |
| 探索式测试 | 低 | 高 | P3+ | Phase 9 |

---

## 四、文件路径映射表

### 4.1 需要新增的文件

| 需求路径 | 实际落地路径 | 用途 |
|---------|-------------|------|
| `docs/upgrade-plan.md` | `docs/upgrade-plan.md` | 本文档 |
| `src/core/test-scheduler.ts` | `src/core/test-scheduler.ts` | 智能测试调度器 |
| `src/core/parallel-runner.ts` | `src/core/parallel-runner.ts` | 并发执行框架 |
| `src/core/workers/test-worker.ts` | `src/core/workers/test-worker.ts` | Worker 执行入口 |
| `src/core/state-graph-builder.ts` | `src/core/state-graph-builder.ts` | 状态图谱构建器 |
| `src/core/exploration-runner.ts` | `src/core/exploration-runner.ts` | 探索式测试执行器 |
| `src/ai/rag-memory.ts` | `src/ai/rag-memory.ts` | RAG 长期记忆引擎 |
| `src/ai/business-flow-analyzer.ts` | `src/ai/business-flow-analyzer.ts` | 业务流分析器 |
| `src/ai/prompts/visual-business-flow.prompt.ts` | `src/ai/prompts/visual-business-flow.prompt.ts` | 业务流 Prompt |
| `src/knowledge/repository.ts` | `src/knowledge/repository.ts` | 统一数据访问层 |
| `src/knowledge/rag-memory.ts` | `src/knowledge/rag-memory.ts` | RAG 记忆存储 |
| `src/knowledge/failure-pattern-library.ts` | `src/knowledge/failure-pattern-library.ts` | 失败模式库增强 |
| `src/knowledge/element-mapping.ts` | `src/knowledge/element-mapping.ts` | 元素映射持久化 |
| `src/testers/visual/baseline-manager.ts` | `src/testers/visual/baseline-manager.ts` | 视觉基线管理 |
| `src/testers/web/visual-baseline.ts` | `src/testers/web/visual-baseline.ts` | Web 视觉基线 |
| `src/cli/commands/explore.ts` | `src/cli/commands/explore.ts` | 探索命令 |
| `src/types/knowledge.types.ts` | `src/types/knowledge.types.ts` | 知识库类型 |
| `src/types/scheduler.types.ts` | `src/types/scheduler.types.ts` | 调度器类型 |
| `src/types/rag.types.ts` | `src/types/rag.types.ts` | RAG 类型 |
| `src/types/state-graph.types.ts` | `src/types/state-graph.types.ts` | 状态图谱类型 |
| `src/types/worker.types.ts` | `src/types/worker.types.ts` | Worker 类型 |

### 4.2 需要修改的文件

| 文件路径 | 修改内容 |
|---------|---------|
| `src/core/orchestrator.ts` | 历史知识加载、调度器集成、并发执行、状态图谱集成 |
| `src/core/event-bus.ts` | 新增智能化升级相关事件 |
| `src/ai/case-generator.ts` | 历史上下文输入、业务流分析集成 |
| `src/ai/self-healer.ts` | 数据库持久化、RAG 增强 |
| `src/ai/failure-analyzer.ts` | 失败模式库集成、自动修复执行 |
| `src/ai/flow-optimizer.ts` | 数据库持久化、闭环机制 |
| `src/knowledge/db/index.ts` | 新增表结构 |
| `src/knowledge/test-history.ts` | 用例级统计、稳定性分析 |
| `src/knowledge/failure-patterns.ts` | 自动修复配置、resolvedCount |
| `src/types/index.ts` | 导出新类型 |
| `src/reporters/report-generator.ts` | 新能力展示 |
| `src/cli/index.ts` | explore 命令注册 |
| `config/ai.config.ts` | Embedding 配置 |

---

## 五、数据库表结构补充建议

### 5.1 需要新增的表

```sql
-- 用例历史统计表
CREATE TABLE IF NOT EXISTS case_statistics (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  project TEXT NOT NULL,
  platform TEXT NOT NULL,
  total_runs INTEGER DEFAULT 0,
  pass_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  skip_count INTEGER DEFAULT 0,
  pass_rate REAL DEFAULT 0,
  consecutive_passes INTEGER DEFAULT 0,
  consecutive_failures INTEGER DEFAULT 0,
  stability_score REAL DEFAULT 0,
  is_stable INTEGER DEFAULT 0,
  last_run_time TEXT,
  last_result TEXT,
  avg_duration_ms INTEGER DEFAULT 0,
  created TEXT NOT NULL,
  updated TEXT NOT NULL,
  UNIQUE(case_id, project, platform)
);

-- 调度决策记录表
CREATE TABLE IF NOT EXISTS scheduler_decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  project TEXT NOT NULL,
  platform TEXT NOT NULL,
  risk_score REAL DEFAULT 0,
  priority TEXT DEFAULT 'P2',
  scheduled_order INTEGER DEFAULT 0,
  skip_decision INTEGER DEFAULT 0,
  skip_reason TEXT,
  historical_pass_rate REAL DEFAULT 0,
  last_status TEXT,
  created TEXT NOT NULL
);

-- RAG 长期记忆表
CREATE TABLE IF NOT EXISTS rag_memories (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  platform TEXT,
  memory_type TEXT NOT NULL,
  context_url TEXT,
  context_package TEXT,
  dom_summary TEXT,
  view_summary TEXT,
  execution_result TEXT NOT NULL,
  solution_strategy TEXT,
  solution_steps TEXT,
  related_screenshots TEXT,
  related_logs TEXT,
  embedding BLOB,
  confidence REAL DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);

-- 业务流结构表
CREATE TABLE IF NOT EXISTS business_flows (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  platform TEXT NOT NULL,
  flow_name TEXT NOT NULL,
  flow_description TEXT,
  entry_url TEXT,
  steps_json TEXT NOT NULL,
  page_dependencies TEXT,
  critical_path INTEGER DEFAULT 0,
  confidence REAL DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  last_used TEXT,
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);

-- 状态图谱节点表
CREATE TABLE IF NOT EXISTS state_graph_nodes (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  platform TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  state_name TEXT,
  state_type TEXT,
  url_pattern TEXT,
  activity_name TEXT,
  view_hierarchy_hash TEXT,
  key_elements TEXT,
  screenshot_path TEXT,
  visit_count INTEGER DEFAULT 1,
  last_visit TEXT,
  created TEXT NOT NULL,
  UNIQUE(state_hash, project, platform)
);

-- 状态图谱边表
CREATE TABLE IF NOT EXISTS state_graph_edges (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  platform TEXT NOT NULL,
  source_state_hash TEXT NOT NULL,
  target_state_hash TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_target TEXT,
  action_value TEXT,
  transition_count INTEGER DEFAULT 1,
  success_count INTEGER DEFAULT 1,
  failure_count INTEGER DEFAULT 0,
  last_transition TEXT,
  created TEXT NOT NULL,
  FOREIGN KEY (source_state_hash) REFERENCES state_graph_nodes(state_hash),
  FOREIGN KEY (target_state_hash) REFERENCES state_graph_nodes(state_hash)
);

-- 视觉回归基线表
CREATE TABLE IF NOT EXISTS visual_baselines (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  platform TEXT NOT NULL,
  page_url TEXT NOT NULL,
  page_name TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  browser TEXT,
  device TEXT,
  baseline_image_path TEXT NOT NULL,
  baseline_hash TEXT,
  created TEXT NOT NULL,
  updated TEXT NOT NULL,
  UNIQUE(project, platform, page_url, viewport_width, viewport_height, browser, device)
);

-- 视觉对比结果表
CREATE TABLE IF NOT EXISTS visual_diffs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  baseline_id TEXT NOT NULL,
  current_image_path TEXT NOT NULL,
  diff_image_path TEXT,
  diff_percentage REAL DEFAULT 0,
  diff_pixels INTEGER DEFAULT 0,
  diff_areas TEXT,
  threshold REAL DEFAULT 0,
  passed INTEGER DEFAULT 0,
  created TEXT NOT NULL,
  FOREIGN KEY (baseline_id) REFERENCES visual_baselines(id)
);

-- 自动优化建议表
CREATE TABLE IF NOT EXISTS auto_optimization_suggestions (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  platform TEXT,
  case_id TEXT,
  suggestion_type TEXT NOT NULL,
  suggestion_value TEXT,
  reason TEXT,
  confidence REAL DEFAULT 0,
  auto_applicable INTEGER DEFAULT 0,
  applied INTEGER DEFAULT 0,
  applied_time TEXT,
  effectiveness_score REAL,
  created TEXT NOT NULL
);
```

### 5.2 需要修改的表

```sql
-- failure_patterns 表新增字段
ALTER TABLE failure_patterns ADD COLUMN auto_fix_config TEXT;
ALTER TABLE failure_patterns ADD COLUMN resolved_count INTEGER DEFAULT 0;

-- element_mappings 表确保有 platform 字段（已有）
-- 确保 success_rate 字段（已有）
```

---

## 六、执行顺序建议

### 6.1 Phase 0 完成后的里程碑

完成 Phase 0 后，应达到以下状态：
- ✅ 所有类型定义补齐
- ✅ 数据库表结构完整
- ✅ 统一数据访问层可用
- ✅ EventBus 事件完整
- ✅ 测试基座建立

### 6.2 里程碑 A（必须先达成）

完成 Phase 1-3 后，系统应具备：
- 历史反哺（第二次运行能基于第一次结果决策）
- 智能调度（高风险优先、稳定降频）
- 失败模式库（已知失败快速修复）
- 自愈持久化（重启后映射仍有效）
- 优化建议自动闭环

### 6.3 里程碑 B（核心智能增强）

完成 Phase 4-6 后，系统应明显体现：
- 长期记忆（RAG 召回历史经验）
- 状态图谱兜底（替代路径推导）
- 视觉回归（自动发现 UI 变化）

### 6.4 里程碑 C（高级能力）

完成 Phase 7-10 后，系统将从"自动化测试工具"演进为"具备主动学习与主动探索能力的 AI 测试智能体"。

---

## 七、风险与注意事项

### 7.1 数据库迁移风险

- **风险**：新增表和字段可能影响现有数据
- **缓解**：所有 DDL 使用 `IF NOT EXISTS` 和 `ADD COLUMN IF NOT EXISTS`（SQLite 不支持，需用 try-catch）
- **回滚**：保留旧数据库备份

### 7.2 兼容性风险

- **风险**：新增字段可能导致旧代码报错
- **缓解**：所有新增字段提供默认值
- **测试**：每次变更后运行 `npm run test:self`

### 7.3 性能风险

- **风险**：RAG 向量搜索可能影响性能
- **缓解**：限制返回条数（top-3），启用缓存
- **监控**：记录 AI 调用耗时

### 7.4 AI 依赖风险

- **风险**：AI 不可用时系统瘫痪
- **缓解**：所有 AI 调用都有规则引擎降级
- **测试**：专门测试 AI 不可用场景

---

## 八、总结

本项目已完成基础测试框架搭建，但在"智能化升级"方面仍有较大差距。核心问题集中在：

1. **知识未闭环**：历史数据不影响下一次测试
2. **调度不智能**：硬编码优先级，无风险分
3. **失败模式不沉淀**：每次失败都走 AI
4. **映射不持久化**：自愈经验重启后丢失
5. **无长期记忆**：相似问题无法召回

通过按 Phase 0 → Phase 10 顺序执行本升级计划，将逐步解决上述问题，最终实现"越测越智能"的目标。

---

**文档版本：** 1.0
**创建日期：** 2026-04-04
**维护者：** Claude Code AI Assistant
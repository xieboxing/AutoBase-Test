# APP-Test.md — AI 驱动自动化测试平台 · APP 测试总说明文档

> 本文档是仓库级"APP 测试总说明文档"，用于快速理解如何使用本平台测试 APP。
> **AI 执行顺序建议：先读 APP-Test.md → 再读 CLAUDE.md → 再读 docs/对应APP测试文档.md**

---

## 目录

- [1. 本仓库用于什么](#1-本仓库用于什么)
- [2. 支持哪些测试能力](#2-支持哪些测试能力)
- [3. 测试执行总流程](#3-测试执行总流程)
- [4. 如何启动环境](#4-如何启动环境)
- [5. 如何执行 APP 测试](#5-如何执行-app-测试)
- [6. 如何使用金融/业务流程测试](#6-如何使用金融业务流程测试)
- [7. 报告输出位置和说明](#7-报告输出位置和说明)
- [8. 配置文件怎么写](#8-配置文件怎么写)
- [9. 如何新增一个新的金融 APP](#9-如何新增一个新的金融-app)
- [10. docs 目录约定](#10-docs-目录约定)
- [11. 账号密码和敏感信息管理](#11-账号密码和敏感信息管理)
- [12. 推荐 AI 执行顺序](#12-推荐-ai-执行顺序)
- [13. 失败排查建议](#13-失败排查建议)
- [14. 已知限制](#14-已知限制)
- [15. CFD 计算准确性验证流程](#15-cfd-计算准确性验证流程)

---

## 1. 本仓库用于什么

这是一个 **AI 驱动的全自动化测试平台**，核心能力：

- 📱 **Android APP 自动化测试**：通过 Appium + WebDriverIO 实现 APP UI 自动化
- 🌐 **Web 自动化测试**：通过 Playwright 实现 PC Web / H5 Web 自动化
- 🔌 **API 自动化测试**：自动发现和测试 API 接口
- 🤖 **AI 驱动**：自动生成测试用例、智能自愈、优化建议
- 📊 **可视化报告**：生成中文 HTML/JSON/Markdown 报告
- 💰 **金融业务流程测试**：支持配置化的金融 APP 流程测试

---

## 2. 支持哪些测试能力

### 2.1 APP 测试能力

| 能力 | 说明 | 命令 |
|------|------|------|
| 安装测试 | APK 安装验证 | `autotest app ./app.apk --type smoke` |
| 启动测试 | 冷启动/热启动时间 | `autotest app ./app.apk --type performance` |
| UI 测试 | 基础 UI 交互验证 | `autotest app ./app.apk --type full` |
| 稳定性测试 | Monkey 随机测试 | `autotest app ./app.apk --type monkey` |
| **金融流程测试** | 业务流程自动化 | `autotest financial ./app.apk --config ./configs/xxx.json` |

### 2.2 页面巡检能力

每个页面自动执行以下检查：

**基础检查（第一轮）：**
- ✅ 页面截图保存
- ✅ Page Source / UI XML 保存
- ✅ 可见文本提取
- ✅ 页面空白检测
- ✅ 关键元素缺失检测
- ✅ 未翻译 Key 检测
- ✅ 中英文混杂检测
- ✅ 占位符未替换检测
- ✅ 乱码检测
- ✅ 文本截断检测
- ✅ 元素重叠检测
- ✅ 按钮遮挡检测

**增强检查（第二轮）：**
- ✅ OCR 文本识别（支持 Tesseract.js、Google Vision、AI Vision）
- ✅ OCR 与 DOM 文本对比检测渲染问题
- ✅ 问题区域标注截图（红色/橙色/蓝色框标注问题位置）
- ✅ 置信度评分（综合视觉证据、DOM 证据、OCR 证据、AI 确认）
- ✅ 问题去重和聚类（相同问题在不同语言中聚合）
- ✅ 智能严重级别调整（根据置信度自动升降级）
- ✅ AI 视觉分析（可选，需要配置 AI API Key）

### 2.3 多语言支持

- 支持配置多个语言（中文、英文、日文、韩文等）
- 每个语言完整重新执行主流程
- 每个语言独立生成页面检查结果
- 报告按语言分组展示

---

## 3. 测试执行总流程

### 3.1 APP 金融流程测试

```
1. 回到手机主界面
2. 打开金融 APP
3. 根据账号密码登录
4. 查看/检查每一个核心页面
5. 开仓（可选）
6. 查看持仓（可选）
7. 平仓（可选）
8. 查看历史记录（可选）
9. 检查余额变化（可选）
10. 退出登录
11. 切换语言
12. 用切换后的语言重新执行整套流程
```

---

## 4. 如何启动环境

### 4.1 环境要求

| 环境 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | ≥ 18.0 | 运行测试框架 |
| Appium | 2.x | APP 自动化服务 |
| Android SDK | 已配置 ADB | 连接 Android 设备 |
| Java JDK | ≥ 8 | Appium 依赖 |

### 4.2 启动步骤

```bash
# 1. 安装依赖
npm install

# 2. 检查环境
npx autotest doctor

# 3. 启动 Appium Server
appium

# 4. 连接 Android 设备（真机或模拟器）
adb devices

# 5. 运行测试
npx autotest financial ./app.apk --config ./configs/xxx.json
```

### 4.3 环境变量配置

创建 `.env` 文件：

```bash
# Appium 配置
APPIUM_HOST=127.0.0.1
APPIUM_PORT=4723

# AI 配置（可选）
AI_PROVIDER=anthropic
AI_API_KEY=your-api-key
AI_MODEL=claude-sonnet-4-20250514

# 金融 APP 账号密码（敏感信息，通过环境变量管理）
SLICKORPS_USERNAME=your-username
SLICKORPS_PASSWORD=your-password
```

### 4.4 环境检查

```bash
# 一键检查所有环境依赖
npx autotest doctor
```

---

## 5. 如何执行 APP 测试

### 5.1 基础 APP 测试

```bash
# 冒烟测试
npx autotest app ./my-app.apk --type smoke

# 全量测试
npx autotest app ./my-app.apk --type full

# 性能测试
npx autotest app ./my-app.apk --type performance

# 指定设备
npx autotest app ./my-app.apk --device emulator-5554
```

### 5.2 金融流程测试

```bash
# 使用配置文件执行金融流程测试
npx autotest financial ./slickorps.apk --config ./configs/financial/slickorps.demo.json

# 交互式配置（无配置文件）
npx autotest financial ./slickorps.apk

# 指定语言
npx autotest financial ./slickorps.apk --config ./configs/slickorps.json --languages zh-CN,en-US

# 跳过交易流程
npx autotest financial ./slickorps.apk --config ./configs/slickorps.json --skip-trading

# 生成多种格式报告
npx autotest financial ./slickorps.apk --config ./configs/slickorps.json --report html,json,markdown
```

### 5.3 页面探测命令（第二轮新增）

用于发现和探索页面元素，生成定位器建议：

```bash
# 探测当前页面元素
npx autotest probe --app ./slickorps.apk

# 探测指定页面
npx autotest probe --app ./slickorps.apk --page "登录页"

# 输出到指定目录
npx autotest probe --app ./slickorps.apk --output ./probe-results

# 生成 HTML 报告
npx autotest probe --app ./slickorps.apk --report html
```

探测命令会输出：
- 📸 页面截图
- 📄 Page Source XML
- 📋 交互元素列表（按钮、输入框、文本、图标等）
- 💡 定位器建议（id、xpath、accessibility-id、text 等策略）
- 📊 HTML 探测报告

---

## 6. 如何使用金融/业务流程测试

### 6.1 配置文件结构

金融流程测试通过 JSON 配置文件定义，主要包括：

```json
{
  "version": "1.0.0",
  "app": { "appName": "...", "packageName": "...", "launchActivity": "..." },
  "login": { "usernameLocator": "...", "passwordLocator": "...", "..." },
  "pages": [ { "id": "...", "name": "...", "identifier": "..." } ],
  "trading": { "openPosition": "...", "viewPosition": "...", "..." },
  "languages": { "supportedLanguages": [...] },
  "inspection": { "basicRules": [...] }
}
```

### 6.2 配置示例

参考 `configs/financial/slickorps.demo.json`

### 6.3 关键概念

| 概念 | 说明 |
|------|------|
| ElementLocator | 元素定位器，支持 id/xpath/class/accessibility-id/text 等策略 |
| PageConfig | 页面配置，定义页面标识、导航方式、检查规则 |
| TradingConfig | 交易配置，定义开仓、持仓、平仓、历史记录、余额检查 |
| LanguageConfig | 语言配置，定义支持的语言和切换方式 |
| InspectionRule | 检查规则，定义页面巡检的具体检查项 |

---

## 7. 报告输出位置和说明

### 7.1 输出位置

```
data/reports/
├── financial-2024-01-15T10-30-00/
│   ├── report.html          # HTML 可视化报告
│   ├── report.json          # JSON 数据报告
│   ├── screenshots/         # 所有截图
│   │   ├── zh-CN/           # 中文语言截图
│   │   │   ├── original/    # 原始截图
│   │   │   └── annotated/   # 标注截图（第二轮新增）
│   │   └── en-US/           # 英文语言截图
│   ├── page-sources/        # Page Source XML 文件
│   ├── annotated/           # 标注截图目录（第二轮新增）
│   └── logs/                # 运行日志
```

### 7.2 报告内容

HTML 报告包含：

**基础内容（第一轮）：**
1. **测试概览**：设备、APK、包名、版本、时间、语言
2. **主流程结果**：每个步骤的执行状态表格
3. **按语言展示**：每个语言的详细测试结果
4. **页面巡检结果**：截图、问题数量、Page Source 链接
5. **问题列表**：按严重级别排序，带截图证据
6. **交易结果**：开仓、持仓、平仓、历史、余额验证
7. **整体评估**：通过率、风险等级、AI 分析

**增强内容（第二轮）：**
8. **标注截图**：问题区域用颜色框标注
9. **置信度评分**：每个问题的置信度百分比和原因
10. **来源类型**：问题来源（规则检测、OCR 检测、AI 分析、综合分析）
11. **重复计数**：相同问题在不同语言中的重复次数

---

## 8. 配置文件怎么写

### 8.1 配置文件位置

```
configs/financial/
├── slickorps.demo.json      # Slickorps 示例配置
├── xxx-financial.json       # 其他金融 APP 配置
```

### 8.2 配置文件要点

1. **元素定位器必须准确**：如果定位器不准确，测试会失败
2. **账号密码通过环境变量**：不要硬编码在配置文件中
3. **定位器支持 fallback**：可以定义多个备用定位器用于自愈
4. **页面配置完整**：至少包含核心页面的配置
5. **待补充标记**：如果不确定定位器，用 `(待补充)` 标记

### 8.3 定位器策略

| 策略 | 示例 | 说明 |
|------|------|------|
| id | `id:username_input` | 通过 resource-id 定位 |
| xpath | `//android.widget.Button[@text='登录']` | 通过 XPath 定位（最灵活） |
| class | `class:android.widget.Button` | 通过 class name 定位 |
| accessibility-id | `accessibility id:登录按钮` | 通过 content-desc 定位 |
| text | `text:登录` | 通过文本定位 |

---

## 9. 如何新增一个新的金融 APP

### 9.1 步骤

1. **创建配置文件**：复制 `configs/financial/slickorps.demo.json` 作为模板
2. **创建测试文档**：复制 `docs/templates/金融APP测试文档模板.md` 到 `docs/{APP名称}测试文档.md`
3. **填充文档内容**：根据 APP 实际情况填充文档中的占位符
4. **配置定位器**：根据 APP 实际 UI 填充定位器（使用 Appium Inspector 获取）
5. **配置账号密码环境变量**：在 `.env` 文件中添加
6. **执行测试**

### 9.2 必须更新的文件

| 文件 | 说明 |
|------|------|
| `configs/financial/{app}.json` | APP 配置文件（复制 slickorps.demo.json 作为模板） |
| `docs/{APP}测试文档.md` | APP 业务测试文档（复制 docs/templates/金融APP测试文档模板.md） |
| `.env` | 账号密码环境变量 |

---

## 10. docs 目录约定

```
docs/
├── templates/
│   └── 金融APP测试文档模板.md    # 新增 APP 时的文档模板
├── private/
│   └── Slickorps.local.md       # 本地私有文档（不提交）
│   └── .gitignore               # 忽略 private 目录
├── Slickorps测试文档.md          # Slickorps 业务测试说明
└── XXX金融APP测试文档.md         # 其他 APP 测试说明
```

**约定：**

- 每个 APP 有独立的测试文档
- 文档名称格式：`{APP名称}测试文档.md`
- 私有敏感信息放在 `docs/private/` 目录，不提交到仓库

---

## 11. 账号密码和敏感信息管理

### 11.1 推荐方式

| 方式 | 说明 |
|------|------|
| `.env` 文件 | 保存账号密码、API Key 等敏感信息 |
| 环境变量 | 通过 `process.env` 读取，不硬编码 |
| `docs/private/` | 本地私有文档，加入 `.gitignore` |

### 11.2 示例

```bash
# .env 文件
SLICKORPS_USERNAME=test_user
SLICKORPS_PASSWORD=test_password

# 配置文件中引用
{
  "login": {
    "usernameEnvKey": "SLICKORPS_USERNAME",
    "passwordEnvKey": "SLICKORPS_PASSWORD"
  }
}
```

---

## 12. 推荐 AI 执行顺序

当 AI（Claude Code）接收到测试任务时，推荐按以下顺序执行：

```
1. 先读 APP-Test.md（本文档）
   → 了解平台能力、测试流程、配置方式

2. 再读 CLAUDE.md
   → 了解仓库结构、核心模块、开发规范

3. 再读 docs/对应APP测试文档.md
   → 了解具体 APP 的业务测试要求

4. 再查看 configs/ 对应配置
   → 了解具体 APP 的定位器配置

5. 执行测试命令
```

---

## 13. 失败排查建议

### 13.1 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| Appium 连接失败 | Appium 未启动 | 执行 `appium` 启动服务 |
| 设备未连接 | ADB 未识别设备 | 检查 `adb devices`，重启 adb |
| 定位器失败 | 元素定位不准确 | 使用 Appium Inspector 查看元素 |
| 登录失败 | 账号密码错误或环境变量未配置 | 检查 `.env` 文件 |
| 页面空白 | APP 加载异常 | 检查网络、API 响应 |

### 13.2 排查步骤

1. 检查 Appium Server 是否运行
2. 检查设备连接状态：`adb devices`
3. 检查 APP 是否正确安装和启动
4. 使用 Appium Inspector 验证定位器
5. 查看报告中的截图和 Page Source

---

## 14. 已知限制

### 14.1 当前限制

- 仅支持 Android APP（iOS 支持计划中）
- OCR 需要配置 OCR 服务（Tesseract.js、Google Vision 或 AI Vision）
- AI 视觉分析需要配置 AI API Key
- 复杂手势操作需要手动配置
- 系统语言切换需要特殊权限

### 14.2 第二轮已实现增强

- ✅ OCR 文本识别和验证
- ✅ AI 视觉检测能力（可选）
- ✅ 问题标注截图
- ✅ 置信度评分和智能降级
- ✅ 问题去重和聚类
- ✅ 页面探测工具（probe 命令）

### 14.3 未来计划增强

- 性能监控和分析
- 更丰富的检查规则
- iOS APP 支持

---

## 15. CFD 计算准确性验证流程

### 15.1 概述

金融 APP 交易功能涉及复杂的 CFD（差价合约）计算，为确保 APP 显示的计算结果准确无误，平台提供「截图验证 → 方法调用 → 问题反馈」的标准化测试流程。

### 15.2 核心计算模块

```
src/calculation/
├── cfd-calculations.ts      # CFD 计算核心模块
```

### 15.3 验证流程步骤

**测试执行流程（按顺序操作）：**

| 测试节点 | 操作要求 | 验证方法 |
|----------|----------|----------|
| 下单前 | 截图保存订单参数（品种、手数、杠杆、价格等） | 调用 `calculateRequiredMargin` 方法，对比 APP 显示的保证金值 |
| 下单后 | 截图保存「持仓明细」页面（含占用保证金、浮动盈亏） | 调用 `calculateRequiredMargin` + `calculateFloatingPnL` 方法，对比 APP 显示值 |
| 平仓后 | 截图保存「平仓记录」页面（含平仓价格、实际盈亏） | 调用 `calculateClosedPnL` 方法，对比 APP 显示的平仓盈亏值 |

### 15.4 问题反馈机制

当计算结果不一致时，需记录以下信息：

| 字段 | 说明 | 示例 |
|------|------|------|
| 截图标识 | 截图文件名或路径 | `screenshots/zh-CN/trading-order.png` |
| 计算方法 | 调用的具体方法名 | `calculateRequiredMargin` |
| APP 显示值 | APP 页面上显示的数值 | `保证金: 70.75 USD` |
| 方法计算值 | 调用方法得到的数值 | `{ margin: 70.75, formula: "..." }` |
| 差异详情 | 具体的数值差异 | `APP: 70.75, 计算: 71.20, 差异: 0.45 USD` |
| 初步分析 | 可能的问题原因 | `汇率参数差异、合约单位配置不同、四舍五入精度` |

### 15.5 核心计算方法清单

| 方法名 | 功能 | 必填参数 | 输出 |
|--------|------|----------|------|
| `calculateRequiredMargin` | 保证金计算 | productType, lotSize, contractSize, leverage, openPrice | MarginResult |
| `calculateFloatingPnL` | 浮动盈亏计算 | direction, lotSize, contractSize, openPrice, currentBid/AskPrice | PnLResult |
| `calculateClosedPnL` | 平仓盈亏计算 | direction, lotSize, contractSize, openPrice, closePrice | PnLResult |
| `calculateExpectedPnL` | 预计盈亏计算 | direction, lotSize, contractSize, openPrice, inputPrice | PnLResult |
| `calculateSpreadCost` | 点差成本计算 | direction, lotSize, contractSize, openPrice, spreadBid/AskPrice | PnLResult |
| `calculateSwap` | 隔夜利息计算 | productType, lotSize, contractSize, closePriceForSwap, swapRate | SwapResult |
| `calculateMarginLevel` | 保证金水平 | equity, totalUsedMargin | AccountResult |
| `calculateEquity` | 净值计算 | deposit, withdrawal, totalClosedNetPnL, totalFloatingNetPnL | AccountResult |
| `calculateAvailableBalance` | 可用余额 | equity, totalUsedMargin | AccountResult |
| `detectProductType` | 产品类型识别 | symbol | CFDProductType |

### 15.6 参数获取来源

| 参数 | 获取方式 |
|------|----------|
| productType | 根据品种代码调用 `detectProductType('EURUSD')` 自动识别 |
| lotSize | APP 下单页面显示的手数 |
| contractSize | APP 配置或默认值（外汇: 100000, 黄金: 100） |
| leverage | APP 账户设置或品种详情页 |
| openPrice | APP 下单时的开仓价格 |
| closePrice | APP 平仓记录页显示的平仓价格 |
| baseCurrencyToUsdRate | 外汇汇率（基础货币兑美元） |
| quoteCurrencyToUsdRate | 计价货币兑美元汇率 |

### 15.7 容差设置

由于 APP 显示值可能存在四舍五入差异，建议设置容差：

| 计算类型 | 容差范围 |
|----------|----------|
| 保证金 | ±0.5% 或 ±1 USD |
| 盈亏计算 | ±0.5% 或 ±5 USD |
| 隔夜利息 | ±1% 或 ±0.5 USD |

### 15.8 验证报告格式

在测试报告中新增「CFD 计算验证」章节：

```
## CFD 计算准确性验证

### 保证金计算验证
| 品种 | 手数 | APP显示 | 方法计算 | 差异 | 状态 |
|------|------|---------|----------|------|------|
| EUR/USD | 0.03 | 70.75 | 70.75 | 0 | ✅ 通过 |

### 浮动盈亏验证
| 品种 | 方向 | APP显示 | 方法计算 | 差异 | 状态 |
|------|------|---------|----------|------|------|
| EUR/USD | BUY | +19200 | +19200 | 0 | ✅ 通过 |

### 平仓盈亏验证
| 品种 | 方向 | APP显示 | 方法计算 | 差异 | 状态 |
|------|------|---------|----------|------|------|
| EUR/USD | BUY | +19200 | +19200 | 0 | ✅ 通过 |
```

---

## 附录：命令速查表

| 命令 | 说明 |
|------|------|
| `npx autotest doctor` | 环境检查 |
| `npx autotest app ./app.apk --type smoke` | APP 冒烟测试 |
| `npx autotest financial ./app.apk --config xxx.json` | 金融流程测试 |
| `npx autotest probe --app ./app.apk` | 页面探测（第二轮新增） |
| `npx autotest web https://example.com` | Web 测试 |
| `npx autotest report --latest` | 查看最新报告 |

---

*文档版本：1.3.0 | 更新时间：2026-04-05 | 新增 CFD 计算准确性验证流程*
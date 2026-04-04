# AutoBase-Test 🤖

> **给我一个 URL 或 APK，全自动完成专业级测试**

一个 AI 驱动的全自动化测试平台，让产品经理（非技术人员）也能轻松完成专业级测试。

## ✨ 核心特性

- 🌐 **Web 测试**：提供 URL，自动测试 PC Web + H5 移动端
- 📱 **APP 测试**：提供 APK，自动测试 Android 应用
- 🔗 **API 测试**：提供 API 地址，自动发现并测试接口
- 🤖 **AI 智能**：自动生成测试用例、自愈元素定位、智能优化
- 📊 **中文报告**：生成易读的中文测试报告，含截图和建议
- 🔄 **自学习**：越跑越聪明，自动优化测试流程
- 🔍 **探索式测试**：AI 主动漫游发现异常
- 👁️ **视觉回归**：自动检测 UI 变化
- ⚡ **并发执行**：多 Worker 加速测试
- 🧠 **RAG 记忆**：沉淀测试经验，智能召回

## 🚀 快速开始

### 1. 安装

```bash
# 克隆项目
git clone https://github.com/your-repo/auto-test-platform.git
cd auto-test-platform

# 安装依赖
npm install

# 安装浏览器驱动
npx autotest setup
```

### 2. 测试一个网站

```bash
# 一键测试网站（自动判断 PC + H5）
npx autotest web https://example.com

# 测试完成后自动打开报告
```

### 3. 测试一个 APP

```bash
# 测试 APK 文件
npx autotest app ./my-app.apk

# 测试已安装的应用
npx autotest app --package com.example.myapp
```

### 4. 测试 API

```bash
# 测试 API 接口
npx autotest api https://api.example.com/v1
```

## 📋 命令概览

| 命令 | 说明 |
|------|------|
| `npx autotest web <url>` | 测试网站 |
| `npx autotest app <apk>` | 测试 APP |
| `npx autotest api <url>` | 测试 API |
| `npx autotest all --config <path>` | 全部测试 |
| `npx autotest explore <url>` | 探索式测试 |
| `npx autotest optimize --project <name>` | AI 优化测试 |
| `npx autotest report --latest` | 查看最新报告 |
| `npx autotest visual list` | 视觉基线管理 |
| `npx autotest record <url>` | 录制操作生成用例 |
| `npx autotest doctor` | 检查环境 |
| `npx autotest setup` | 安装浏览器驱动 |

## 🌐 Web 测试详细用法

```bash
# 仅测试 PC 端
npx autotest web https://example.com --platform pc

# 仅测试 H5 移动端
npx autotest web https://example.com --platform h5

# 指定测试类型
npx autotest web https://example.com --type smoke          # 冒烟测试
npx autotest web https://example.com --type full           # 全量测试
npx autotest web https://example.com --type performance    # 性能测试
npx autotest web https://example.com --type security       # 安全测试

# 跨浏览器测试
npx autotest web https://example.com --browser chrome,firefox,safari

# 指定设备模拟
npx autotest web https://example.com --device "iPhone 15,Pixel 7"

# 需要登录的网站
npx autotest web https://example.com --login-url /login --username admin --password 123456

# 设置测试深度（AI 探索页面的深度）
npx autotest web https://example.com --depth 3

# 生成多种格式报告
npx autotest web https://example.com --report html,json,markdown
```

## 📱 APP 测试详细用法

### 环境准备（重要）

APP 测试需要以下环境：

#### 1. Java JDK
```bash
# 检查 Java 是否已安装
java -version

# 如果未安装，从 https://adoptium.net/ 下载 JDK 8 或 JDK 11
# 设置 JAVA_HOME 环境变量
```

#### 2. Android SDK
```bash
# 方式一：安装 Android Studio（推荐）
# 下载地址：https://developer.android.com/studio

# 方式二：仅安装命令行工具
# 下载地址：https://developer.android.com/studio#command-line-tools-only

# 设置 ANDROID_HOME 环境变量（Windows 示例）
setx ANDROID_HOME "C:\Users\你的用户名\AppData\Local\Android\Sdk"
```

#### 3. Appium
```bash
# 安装 Appium
npm install -g appium

# 安装 UI Automator2 驱动（Android 自动化必需）
appium driver install uiautomator2

# 启动 Appium 服务（默认端口 4723）
appium
```

#### 4. 连接设备
```bash
# 真机连接
# 1. 在 Android 设备上开启「开发者选项」和「USB 调试」
# 2. 用 USB 线连接电脑
# 3. 确认设备已连接
adb devices

# 使用模拟器
# Android Studio 自带模拟器，或使用第三方模拟器如 Genymotion
# 启动模拟器后，adb devices 应显示设备
```

#### 5. 环境检查
```bash
# 一键检查所有环境依赖
npm run doctor

# 或
npx tsx src/cli/index.ts doctor
```

### 测试 APK 文件

```bash
# 基础测试
npx autotest app ./my-app.apk

# 冒烟测试（快速验证核心功能）
npx tsx src/cli/index.ts app ./my-app.apk --type smoke

# 全量测试
npx tsx src/cli/index.ts app ./my-app.apk --type full

# 性能专项测试
npx tsx src/cli/index.ts app ./my-app.apk --type performance

# 稳定性测试（Monkey 随机操作）
npx tsx src/cli/index.ts app ./my-app.apk --type monkey

# 指定设备
npx tsx src/cli/index.ts app ./my-app.apk --device emulator-5554
```

### 测试已安装的应用

```bash
# 通过包名测试（无需 APK 文件）
npx tsx src/cli/index.ts app --package com.example.myapp

# 指定主 Activity（可选）
npx tsx src/cli/index.ts app --package com.example.myapp --activity .MainActivity
```

### APP 测试内容

测试平台会自动执行以下测试：

| 测试项 | 说明 |
|--------|------|
| 安装测试 | APK 安装是否成功、安装时间、占用空间 |
| 启动测试 | 冷启动/热启动时间、启动是否正常 |
| UI 测试 | 页面元素是否正常显示、交互是否响应 |
| 手势测试 | 滑动、缩放、长按等手势操作 |
| 生命周期测试 | 前后台切换、屏幕旋转、低内存恢复 |
| 权限测试 | 各权限弹窗的处理 |
| 性能测试 | CPU、内存、FPS、电量消耗 |
| 稳定性测试 | Monkey 随机操作测试 |

### 示例：测试一个 APK

```bash
# 1. 确保 Appium 已启动
appium &

# 2. 连接设备
adb devices
# 输出应显示类似：
# List of devices attached
# emulator-5554   device

# 3. 执行测试
npx tsx src/cli/index.ts app ./Slickorps_1.0.0.apk --type smoke

# 4. 查看报告
# 报告自动生成在 data/reports/ 目录
```

## 🔗 API 测试详细用法

```bash
# 基础 API 测试
npx autotest api https://api.example.com/v1

# 带认证的 API 测试
npx autotest api https://api.example.com/v1 --auth-token "Bearer xxx"

# 不同测试类型
npx autotest api https://api.example.com/v1 --type smoke
npx autotest api https://api.example.com/v1 --type contract
npx autotest api https://api.example.com/v1 --type stress
```

## 🗄️ 数据库与知识库

测试平台使用 SQLite 数据库存储测试结果和知识库数据，支持按平台（PC/H5/APP）分类存储。

### 数据库位置

```
db/
├── sqlite.db              # 主数据库（测试结果、知识库）
└── ext/                   # SQLite 向量扩展（用于 AI 语义搜索）
    ├── windows/vec0.dll
    ├── linux/vec0.so
    └── macos/vec0.so
```

### 平台分类存储

测试结果自动按平台分类：
- **PC Web** (`pc-web`) - 桌面端测试结果
- **H5 Web** (`h5-web`) - 移动端 Web 测试结果
- **Android APP** (`android-app`) - APP 测试结果
- **API** (`api`) - API 测试结果

### 数据库操作

```bash
# 初始化数据库
npm run db:init

# 从旧版迁移数据（如果有旧数据）
npm run db:migrate
```

### 向量扩展（可选）

向量扩展用于 AI 语义搜索功能：
- 语义搜索测试用例
- 智能元素匹配
- 失败模式聚类分析

如果向量扩展不可用，系统会自动降级到普通模式运行。

## 📊 测试报告

测试完成后自动生成报告，存储在 `data/reports/` 目录：

- **HTML 报告**：可视化报告，包含截图、图表、详细步骤
- **JSON 报告**：结构化数据，便于集成到其他系统
- **Markdown 报告**：适合文档和 Git 提交

```bash
# 查看最新报告
npx autotest report --latest

# 查看历史报告列表
npx autotest report --list

# 对比两次报告
npx autotest report --diff run-001 run-002

# 查看趋势分析
npx autotest report --trend --last 10
```

## 🤖 AI 智能功能

### 自动生成测试用例

无需手写测试用例，AI 会分析页面结构自动生成：

- 冒烟测试：验证页面能打开、关键元素存在
- 功能测试：表单提交、按钮点击、导航跳转
- 边界测试：空输入、超长输入、特殊字符
- 异常测试：网络断开、快速连续点击

### 自愈机制

页面改版后元素定位失效？AI 自动找到新选择器修复：

1. 截图当前页面
2. 查询知识库历史定位方式
3. 发送截图 + DOM 给 AI，请求新定位方式
4. 用新定位重试
5. 成功则更新知识库映射

### AI 优化

根据历史测试数据自动优化：

```bash
# AI 分析历史数据并给出优化建议
npx autotest optimize --project myproject

# 自动应用优化建议
npx autotest optimize --project myproject --auto-apply
```

优化内容：
- 调整不稳定用例的等待时间
- 降低稳定用例的执行频率
- 标记无效用例建议删除
- 补充未覆盖的测试场景

## 📹 录制测试用例

手动操作一遍，自动生成测试用例：

```bash
# 录制 Web 操作
npx autotest record https://example.com

# 生成的用例保存在 test-suites/default/cases/
```

## ⚙️ 环境要求

- **Node.js**：20.x 或更高版本
- **浏览器**：Chrome（自动安装）、Firefox、Safari（可选）
- **Android SDK**：APP 测试需要
- **Appium**：APP 测试需要

### 检查环境

```bash
npx autotest doctor
```

## 📁 项目配置

创建项目配置文件 `test-suites/myproject/config.json`：

```json
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
        "password": "env:TEST_PASSWORD"
      }
    },
    "app": {
      "apkPath": "./data/apks/my-app.apk",
      "packageName": "com.example.myapp"
    },
    "api": {
      "baseUrl": "https://api.example.com/v1"
    }
  },
  "settings": {
    "testDepth": 3,
    "timeout": 30000,
    "retryCount": 2,
    "enableAiOptimization": true,
    "reportFormats": ["html", "json"]
  }
}
```

## 🔧 配置 AI 模型

创建 `.env` 文件：

```bash
# AI 模型配置
AI_PROVIDER=anthropic          # anthropic | openai
AI_API_KEY=your-api-key
AI_MODEL=claude-sonnet-4-20250514

# 可选：代理配置
HTTP_PROXY=http://localhost:7890
HTTPS_PROXY=http://localhost:7890
```

### 不使用 AI

没有 AI API Key 也能运行，系统会自动降级到规则引擎：

- 基于规则生成基础测试用例
- 使用预设的等待策略
- 不进行智能优化

## 📖 测试用例格式

测试用例使用 JSON 格式：

```json
{
  "id": "tc-login-001",
  "name": "用户登录流程测试",
  "description": "验证用户可以使用邮箱和密码成功登录",
  "priority": "P0",
  "type": "functional",
  "platform": ["pc-web", "h5-web"],
  "tags": ["login", "auth", "smoke"],
  "steps": [
    { "order": 1, "action": "navigate", "target": "/login" },
    { "order": 2, "action": "fill", "target": "[name='email']", "value": "test@example.com" },
    { "order": 3, "action": "fill", "target": "[name='password']", "value": "Test123456" },
    { "order": 4, "action": "click", "target": "button[type='submit']" },
    { "order": 5, "action": "assert", "type": "url-contains", "value": "/dashboard" }
  ]
}
```

## 🔍 探索式测试

让 AI 主动漫游应用，发现异常和未知问题：

```bash
# 探索网站
npx autotest explore https://example.com

# 指定探索策略
npx autotest explore https://example.com --strategy reward-based

# 限制探索步数和时长
npx autotest explore https://example.com --max-steps 50 --max-duration 600

# 显示浏览器窗口
npx autotest explore https://example.com --no-headless
```

探索策略：
- `random` - 随机探索
- `breadth-first` - 广度优先
- `depth-first` - 深度优先
- `reward-based` - 基于奖励（默认）
- `ai-guided` - AI 引导

探索报告包含：
- 发现的新状态数量
- 发现的异常（控制台错误、网络错误、崩溃等）
- 自动生成的回归测试用例

## 👁️ 视觉回归测试

自动检测 UI 视觉变化：

```bash
# 列出所有视觉基线
npx autotest visual list

# 对比截图与基线
npx autotest visual compare ./screenshot.png --baseline-id baseline-001

# 更新基线
npx autotest visual update ./screenshot.png --baseline-id baseline-001

# 删除基线
npx autotest visual delete baseline-001

# 查看统计信息
npx autotest visual stats
```

## ⚡ 并发执行

加速测试执行：

```bash
# 自动检测 CPU 核心数并发执行
npx autotest web https://example.com --parallel auto

# 指定并发数
npx autotest web https://example.com --parallel 4
```

## 🧠 智能特性

### 知识库反哺闭环

历史测试数据自动影响下次测试：
- 高失败率用例优先执行
- 稳定用例自动降频
- 历史失败模式预加载

### 智能调度

基于风险分动态排序：
- 风险分 = 失败率 40% + 上次状态 25% + 优先级 20% + 老化 15%
- 高风险用例优先执行
- 连续 30 次通过的用例可跳过

### 自动修复

失败用例自动尝试修复：
- 匹配失败模式库
- 应用自动修复策略（增加超时、添加等待、重试）
- 修复成功后记录到 RAG 记忆

### RAG 长期记忆

沉淀测试经验：
- 失败场景记忆
- 自愈成功记忆
- 新状态发现记忆
- 相似场景智能召回

### 状态图谱

构建应用状态地图：
- 自动识别页面状态
- 记录状态转移路径
- 自愈失败时尝试替代路径

### 业务流测试

基于截图和页面语义识别业务流程：
- 自动识别登录、购物、搜索等业务流
- 生成端到端测试用例
- 识别关键业务步骤

## ❓ 常见问题 FAQ

### Web 测试相关

**Q: 浏览器安装失败怎么办？**
A: 运行 `npx playwright install` 手动安装浏览器驱动，或检查网络代理设置。

**Q: 测试需要登录的网站怎么办？**
A: 使用 `--login-url` 和 `--username`/`--password` 参数，或在配置文件中设置 credentials。

### APP 测试相关

**Q: APP 测试需要真机吗？**
A: 不需要，可以使用 Android 模拟器。Android Studio 自带的模拟器或 Genymotion 都可以。

**Q: Appium 连接失败怎么办？**
A:
1. 确保 Appium 服务已启动：`appium`
2. 检查端口 4723 是否被占用
3. 确认 UI Automator2 驱动已安装：`appium driver list --installed`

**Q: ADB 找不到设备？**
A:
1. 确保设备已开启 USB 调试
2. 尝试重新插拔 USB 线
3. 运行 `adb kill-server && adb start-server` 重启 ADB 服务

**Q: ANDROID_HOME 环境变量如何设置？**
A: Windows 系统在系统环境变量中添加 `ANDROID_HOME`，指向 Android SDK 目录（如 `C:\Users\xxx\AppData\Local\Android\Sdk`）。

**Q: APK 安装失败？**
A:
1. 检查 APK 文件是否完整
2. 确保设备有足够存储空间
3. 如果是已安装应用的升级，使用 `--reinstall` 参数

### AI 相关

**Q: AI API Key 怎么获取？**
A:
- Anthropic Claude: https://console.anthropic.com/
- OpenAI: https://platform.openai.com/

**Q: 不用 AI 可以跑吗？**
A: 可以！系统会自动降级到规则引擎，基于预定义规则生成基础测试用例。使用 `--no-ai` 参数强制禁用 AI。

### 报告相关

**Q: 测试报告在哪里？**
A: 报告默认保存在 `data/reports/` 目录。运行 `npx autotest report --latest` 自动打开最新报告。

**Q: 如何自定义报告输出目录？**
A: 在项目配置文件 `config.json` 的 `settings.reportFormats` 中设置输出目录。

## 🧪 开发命令

```bash
# 开发模式
npm run dev

# 运行测试
npm run test:self

# 测试覆盖率
npm run test:self:coverage

# 构建
npm run build

# 代码检查
npm run lint

# 格式化
npm run format

# 数据库初始化
npm run db:init

# 数据库迁移（从旧版迁移）
npm run db:migrate
```

## 📚 文档

- [架构说明](docs/architecture.md)
- [AI Prompt 设计](docs/ai-prompts.md)
- [扩展测试器](docs/extending.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License
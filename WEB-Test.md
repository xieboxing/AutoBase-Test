# Web 测试指南

> 本文档介绍如何使用 AutoBase-Test 进行 Web 自动化测试

## 测试模块说明

Web 测试模块提供以下能力：

| 测试类型 | 说明 |
|----------|------|
| PC Web 测试 | 桌面端浏览器测试 |
| H5 Web 测试 | 移动端 Web 测试（设备模拟） |
| 响应式测试 | 多视口尺寸测试 |
| 跨浏览器测试 | Chrome/Firefox/Safari 测试 |
| 表单测试 | 自动填写和验证表单 |
| 导航测试 | 页面链接和路由测试 |
| 性能测试 | Lighthouse 性能分析 |
| 视觉测试 | 截图对比、布局检查 |
| 安全测试 | XSS、CSRF、安全头检查 |
| 无障碍测试 | WCAG 标准检测 |
| API 测试 | 接口功能测试 |

## 环境准备

### 1. Node.js

```bash
# 检查 Node.js 版本（需要 20.x 或更高）
node --version

# 如果未安装，从 https://nodejs.org/ 下载
```

### 2. 浏览器驱动

```bash
# 安装浏览器驱动
npx autotest setup

# 或手动安装
npx playwright install
```

### 3. 环境检查

```bash
# 一键检查所有环境依赖
npx autotest doctor
```

## 执行测试

### 基础命令

```bash
# 测试网站（自动判断 PC + H5）
npx autotest web https://example.com

# 仅测试 PC 端
npx autotest web https://example.com --platform pc

# 仅测试 H5 移动端
npx autotest web https://example.com --platform h5
```

### 测试类型

```bash
# 冒烟测试（快速验证核心功能）
npx autotest web https://example.com --type smoke

# 全量测试（完整测试）
npx autotest web https://example.com --type full

# 回归测试（对比上次结果）
npx autotest web https://example.com --type regression

# 性能专项测试
npx autotest web https://example.com --type performance

# 安全专项测试
npx autotest web https://example.com --type security

# 无障碍专项测试
npx autotest web https://example.com --type accessibility

# 视觉回归测试
npx autotest web https://example.com --type visual
```

### 浏览器选项

```bash
# 指定浏览器
npx autotest web https://example.com --browser chrome
npx autotest web https://example.com --browser firefox
npx autotest web https://example.com --browser safari

# 跨浏览器测试
npx autotest web https://example.com --browser chrome,firefox,safari
```

### 设备模拟

```bash
# 指定设备模拟（H5 测试）
npx autotest web https://example.com --device "iPhone 15"
npx autotest web https://example.com --device "Pixel 7"
npx autotest web https://example.com --device "iPhone 15,Pixel 7,iPad Pro"

# 支持的设备预设
# iPhone 15, iPhone 14, iPhone SE, Pixel 7, Pixel 6, iPad Pro, Samsung Galaxy S23
```

### 其他选项

```bash
# 设置测试深度（AI 探索页面的深度，默认 3）
npx autotest web https://example.com --depth 5

# 设置超时时间（毫秒）
npx autotest web https://example.com --timeout 60000

# 需要登录的网站
npx autotest web https://example.com --login-url /login --username admin --password 123456

# 并发执行
npx autotest web https://example.com --parallel auto
npx autotest web https://example.com --parallel 4

# 生成多种格式报告
npx autotest web https://example.com --report html,json,markdown

# 禁用 AI（使用规则引擎）
npx autotest web https://example.com --no-ai
```

## 测试流程

### 自动化测试流程

1. **页面探索**：爬取网站所有页面
2. **快照生成**：对每个页面生成截图和 DOM 快照
3. **用例生成**：AI 分析页面，自动生成测试用例
4. **测试执行**：执行各类测试
5. **结果收集**：收集测试结果、截图、日志
6. **报告生成**：生成中文测试报告

### 测试内容

| 阶段 | 测试项 | 说明 |
|------|--------|------|
| 导航 | 页面访问 | 所有页面能否正常打开 |
| 导航 | 链接检查 | 无死链、无空链接 |
| UI | 元素检查 | 关键元素是否存在 |
| UI | 表单测试 | 表单提交、验证 |
| 响应式 | 视口测试 | 不同尺寸下布局正常 |
| 性能 | 加载时间 | LCP、FID、CLS |
| 性能 | Lighthouse | 性能评分和优化建议 |
| 安全 | XSS 检测 | 输入框 XSS 注入测试 |
| 安全 | 安全头 | CSP、HSTS 等检查 |
| 无障碍 | WCAG | axe-core 自动检测 |
| 兼容性 | 跨浏览器 | Chrome/Firefox/Safari |

## 输出文件

测试完成后，以下文件会生成：

```
data/
├── screenshots/           # 截图
│   └── run-xxxxx/        # 按运行 ID 分类
│       ├── pc-home-1920x1080.png
│       ├── h5-home-375x667.png
│       └── ...
├── videos/               # 录屏
│   └── run-xxxxx/
│       └── case-xxx.mp4
├── baselines/            # 视觉基线
│   └── page-home-1920x1080.png
├── logs/                 # 日志
│   └── run-xxxxx.log
└── reports/              # 报告
    └── run-xxxxx/
        ├── report.html
        ├── report.json
        └── report.md
```

## 探索式测试

让 AI 主动漫游网站，发现异常和未知问题：

```bash
# 基础探索
npx autotest explore https://example.com

# 指定探索策略
npx autotest explore https://example.com --strategy reward-based

# 限制探索步数和时长
npx autotest explore https://example.com --max-steps 50 --max-duration 600

# 显示浏览器窗口
npx autotest explore https://example.com --no-headless
```

### 探索策略

| 策略 | 说明 |
|------|------|
| `random` | 随机探索 |
| `breadth-first` | 广度优先探索 |
| `depth-first` | 深度优先探索 |
| `reward-based` | 基于奖励的探索（默认）|
| `ai-guided` | AI 引导探索 |

### 探索报告

探索完成后会生成报告，包含：
- 发现的新状态数量
- 发现的异常（控制台错误、网络错误等）
- 自动生成的回归测试用例

## 视觉回归测试

### 基线管理

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

### 视觉回归测试流程

1. **首次运行**：自动创建基线图
2. **后续运行**：对比当前截图与基线
3. **差异检测**：输出差异图和差异百分比
4. **报告展示**：在报告中展示基线图、当前图、差异图

## API 测试

### API 自动发现

Web 测试过程中自动监听和记录 API 请求：

```bash
# 测试网站时自动发现 API
npx autotest web https://example.com

# API 列表会保存在报告中
```

### 独立 API 测试

```bash
# 基础 API 测试
npx autotest api https://api.example.com/v1

# 带认证
npx autotest api https://api.example.com/v1 --auth-token "Bearer xxx"

# 测试类型
npx autotest api https://api.example.com/v1 --type smoke
npx autotest api https://api.example.com/v1 --type contract
npx autotest api https://api.example.com/v1 --type stress
```

## 常见问题

### 浏览器安装失败

**症状**：`Executable doesn't exist at ...`

**解决方案**：
```bash
# 手动安装浏览器
npx playwright install

# 或指定浏览器
npx playwright install chromium
npx playwright install firefox
```

### 页面加载超时

**症状**：`TimeoutError: page.goto: Timeout 30000ms exceeded`

**解决方案**：
1. 检查网络连接
2. 增加超时时间：`--timeout 60000`
3. 检查目标网站是否可访问

### 元素定位失败

**症状**：`Error: strict mode violation: ... resolved to X elements`

**解决方案**：
1. 使用更精确的选择器
2. 添加等待时间
3. 使用 `data-testid` 属性

### 登录后状态丢失

**症状**：登录成功后，后续步骤显示未登录

**解决方案**：
1. 确保登录后等待页面加载完成
2. 检查是否需要处理 Cookie
3. 使用 `--login-url` 参数自动处理登录

### 跨浏览器测试失败

**症状**：Chrome 通过，Firefox/Safari 失败

**解决方案**：
1. 检查浏览器特定 CSS/JS
2. 确保使用标准 Web API
3. 检查浏览器兼容性问题

## 最佳实践

### 1. 测试用例设计

- 优先测试核心业务流程
- 覆盖正常和异常场景
- 使用有意义的断言
- 避免依赖动态数据

### 2. 选择器策略

- 优先使用 `data-testid` 属性
- 避免使用易变的 class 名
- 使用语义化选择器（`aria-label`、`role`）
- 为关键元素添加测试属性

### 3. 测试执行

- 定期运行全量测试
- 关注性能测试结果的趋势变化
- 及时处理测试发现的 Bug
- 保持测试环境稳定

### 4. 报告分析

- 每次测试后查看报告
- 关注失败用例的错误信息
- 对比历史报告分析趋势
- 根据 AI 建议优化网站

## 新增 Web 测试用例

### 用例文件位置

```
test-suites/
└── myproject/
    ├── config.json      # 项目配置
    └── cases/           # 测试用例
        └── my-test.case.json
```

### 用例格式

```json
{
  "id": "tc-web-001",
  "name": "用户登录测试",
  "description": "测试用户登录流程",
  "priority": "P0",
  "type": "functional",
  "platform": ["pc-web", "h5-web"],
  "tags": ["login", "auth", "smoke"],
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
      "description": "点击登录"
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
  ]
}
```

### 支持的动作

| Action | 参数 | 说明 |
|--------|------|------|
| `navigate` | target | 导航到 URL |
| `click` | target | 点击元素 |
| `fill` | target, value | 填写输入框 |
| `select` | target, value | 选择下拉框 |
| `hover` | target | 悬停 |
| `scroll` | direction | 滚动（up/down）|
| `wait` | value | 等待毫秒数 |
| `screenshot` | - | 截图 |
| `assert` | type, target?, value? | 断言 |

### 支持的断言类型

| Type | 参数 | 说明 |
|------|------|------|
| `element-visible` | target | 元素可见 |
| `element-hidden` | target | 元素隐藏 |
| `text-contains` | target, value | 文本包含 |
| `text-equals` | target, value | 文本等于 |
| `url-contains` | value | URL 包含 |
| `url-equals` | value | URL 等于 |
| `title-contains` | value | 标题包含 |
| `title-equals` | value | 标题等于 |
| `element-count` | target, value | 元素数量 |
| `attribute-equals` | target, value | 属性值等于 |

## 性能测试指标

### Core Web Vitals

| 指标 | 说明 | 良好 | 需改进 | 差 |
|------|------|------|--------|-----|
| LCP | 最大内容绘制 | ≤2.5s | 2.5-4s | >4s |
| FID | 首次输入延迟 | ≤100ms | 100-300ms | >300ms |
| CLS | 累积布局偏移 | ≤0.1 | 0.1-0.25 | >0.25 |

### Lighthouse 评分

| 类别 | 说明 |
|------|------|
| Performance | 性能评分 |
| Accessibility | 无障碍评分 |
| Best Practices | 最佳实践评分 |
| SEO | SEO 评分 |

## 安全测试内容

| 测试项 | 说明 |
|--------|------|
| XSS 注入 | 输入框注入攻击字符串 |
| CSRF 检测 | 表单 CSRF Token 检查 |
| 安全头 | CSP、HSTS、X-Frame-Options 等 |
| 敏感信息泄露 | 源码中的 API Key、Token |
| SSL 证书 | 证书有效性检查 |
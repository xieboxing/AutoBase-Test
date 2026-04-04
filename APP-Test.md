# APP 测试指南

> 本文档介绍如何使用 AutoBase-Test 进行 Android APP 自动化测试

## 测试模块说明

APP 测试模块提供以下能力：

| 测试类型 | 说明 |
|----------|------|
| 安装测试 | APK 安装/卸载/升级测试 |
| 启动测试 | 冷启动/热启动时间测试 |
| UI 测试 | 页面元素交互测试 |
| 手势测试 | 滑动、缩放、长按等手势操作测试 |
| 生命周期测试 | 前后台切换、屏幕旋转、低内存恢复测试 |
| 权限测试 | 各权限弹窗处理测试 |
| 性能测试 | CPU、内存、FPS、电量消耗采集 |
| 稳定性测试 | Monkey 随机操作测试 |

## 环境准备

### 1. Java JDK

```bash
# 检查 Java 是否已安装
java -version

# 如果未安装，从 https://adoptium.net/ 下载 JDK 8 或 JDK 11
# 设置 JAVA_HOME 环境变量
```

### 2. Android SDK

**方式一：安装 Android Studio（推荐）**

1. 下载地址：https://developer.android.com/studio
2. 安装后，SDK 会自动安装在以下位置：
   - Windows: `C:\Users\用户名\AppData\Local\Android\Sdk`
   - macOS: `~/Library/Android/sdk`
   - Linux: `~/Android/Sdk`

**方式二：仅安装命令行工具**

1. 下载地址：https://developer.android.com/studio#command-line-tools-only
2. 解压到指定目录

**设置环境变量**

```bash
# Windows（在系统环境变量中添加）
ANDROID_HOME=C:\Users\用户名\AppData\Local\Android\Sdk

# macOS/Linux（在 ~/.bashrc 或 ~/.zshrc 中添加）
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### 3. Appium

```bash
# 安装 Appium
npm install -g appium

# 安装 UI Automator2 驱动（Android 自动化必需）
appium driver install uiautomator2

# 验证安装
appium driver list --installed

# 启动 Appium 服务（默认端口 4723）
appium
```

### 4. 连接设备

**真机连接**

1. 在 Android 设备上开启「开发者选项」和「USB 调试」
   - 设置 → 关于手机 → 连续点击「版本号」7 次
   - 设置 → 开发者选项 → 开启「USB 调试」
2. 用 USB 线连接电脑
3. 确认设备已连接：
   ```bash
   adb devices
   # 输出应显示类似：
   # List of devices attached
   # ABC123456789    device
   ```

**模拟器**

Android Studio 自带模拟器或使用第三方模拟器（如 Genymotion）：
```bash
# 启动模拟器后，确认设备
adb devices
```

### 5. 环境检查

```bash
# 一键检查所有环境依赖
npm run doctor
# 或
npx autotest doctor
```

## 执行测试

### 基础命令

```bash
# 测试 APK 文件
npx autotest app ./my-app.apk

# 测试已安装的应用（通过包名）
npx autotest app --package com.example.myapp
```

### 测试类型

```bash
# 冒烟测试（快速验证核心功能）
npx autotest app ./my-app.apk --type smoke

# 全量测试（完整测试）
npx autotest app ./my-app.apk --type full

# 性能专项测试
npx autotest app ./my-app.apk --type performance

# 稳定性测试（Monkey 随机操作）
npx autotest app ./my-app.apk --type monkey
```

### 其他选项

```bash
# 指定设备
npx autotest app ./my-app.apk --device emulator-5554

# 设置超时时间（毫秒）
npx autotest app ./my-app.apk --timeout 60000

# 指定主 Activity（可选）
npx autotest app --package com.example.myapp --activity .MainActivity
```

## 测试流程

### 自动化测试流程

1. **环境检查**：检查 Appium、ADB、设备连接
2. **应用安装**：安装 APK 到设备
3. **用例生成**：AI 分析应用界面，生成测试用例
4. **测试执行**：执行各类测试
5. **结果收集**：收集测试结果、截图、日志
6. **报告生成**：生成中文测试报告

### 测试内容

| 阶段 | 测试项 | 说明 |
|------|--------|------|
| 安装 | 安装测试 | APK 安装是否成功、安装时间、占用空间 |
| 启动 | 启动测试 | 冷启动/热启动时间、启动是否正常 |
| UI | 界面测试 | 页面元素是否正常显示、交互是否响应 |
| 手势 | 手势测试 | 滑动、缩放、长按等手势操作 |
| 生命周期 | 生命周期测试 | 前后台切换、屏幕旋转、低内存恢复 |
| 权限 | 权限测试 | 各权限弹窗的处理 |
| 性能 | 性能测试 | CPU、内存、FPS、电量消耗 |
| 稳定性 | Monkey 测试 | 随机操作测试，发现崩溃和异常 |

## 输出文件

测试完成后，以下文件会生成：

```
data/
├── screenshots/           # 截图
│   └── run-xxxxx/        # 按运行 ID 分类
│       ├── step-001.png
│       └── ...
├── videos/               # 录屏
│   └── run-xxxxx/
│       └── case-xxx.mp4
├── logs/                 # 日志
│   └── run-xxxxx.log
└── reports/              # 报告
    └── run-xxxxx/
        ├── report.html
        └── report.json
```

## 常见问题

### Appium 连接失败

**症状**：`ECONNREFUSED 127.0.0.1:4723`

**解决方案**：
1. 确保 Appium 服务已启动：`appium`
2. 检查端口 4723 是否被占用
3. 尝试指定端口：`appium -p 4723`

### ADB 找不到设备

**症状**：`adb devices` 显示空列表或 `unauthorized`

**解决方案**：
1. 确保设备已开启 USB 调试
2. 在设备上确认 USB 调试授权
3. 尝试重新插拔 USB 线
4. 重启 ADB 服务：`adb kill-server && adb start-server`
5. 尝试更换 USB 线或端口

### APK 安装失败

**症状**：`INSTALL_FAILED_*` 错误

**解决方案**：
1. 检查 APK 文件是否完整
2. 确保设备有足够存储空间
3. 如果是已安装应用的升级，使用 `--reinstall` 参数
4. 检查 APK 签名是否正确

### ANDROID_HOME 环境变量问题

**症状**：`ANDROID_HOME is not set`

**解决方案**：
1. 确认 SDK 安装路径
2. 在系统环境变量中添加 `ANDROID_HOME`
3. 重启终端或 IDE 使环境变量生效

### 元素定位失败

**症状**：`Element not found` 或 `NoSuchElementException`

**解决方案**：
1. 检查元素选择器是否正确
2. 增加等待时间
3. 使用 Appium Inspector 查看元素属性
4. 尝试其他定位方式（id、accessibility-id、xpath）

## 最佳实践

### 1. 测试前准备

- 确保设备电量充足（> 30%）
- 关闭不必要的后台应用
- 保持网络连接稳定
- 定期清理设备存储空间

### 2. 测试用例设计

- 优先测试核心业务流程
- 覆盖正常和异常场景
- 添加适当的等待时间
- 避免硬编码敏感信息

### 3. 测试执行

- 先运行冒烟测试验证基本功能
- 定期运行全量测试
- 关注性能测试结果的趋势变化
- 及时处理测试发现的 Bug

### 4. 测试报告

- 每次测试后查看报告
- 关注失败用例的错误信息
- 对比历史报告分析趋势
- 根据报告建议优化应用

## 新增 APP 测试用例

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
  "id": "tc-app-001",
  "name": "登录功能测试",
  "description": "测试用户登录流程",
  "priority": "P0",
  "type": "functional",
  "platform": ["android-app"],
  "tags": ["login", "auth"],
  "steps": [
    {
      "order": 1,
      "action": "tap",
      "target": "id:login_button",
      "description": "点击登录按钮"
    },
    {
      "order": 2,
      "action": "fill",
      "target": "id:username_input",
      "value": "test@example.com",
      "description": "输入用户名"
    },
    {
      "order": 3,
      "action": "fill",
      "target": "id:password_input",
      "value": "Test123456",
      "description": "输入密码"
    },
    {
      "order": 4,
      "action": "tap",
      "target": "id:submit_button",
      "description": "点击提交"
    },
    {
      "order": 5,
      "action": "assert",
      "type": "element-visible",
      "target": "id:home_icon",
      "description": "验证进入首页"
    }
  ]
}
```

### 支持的元素定位方式

| 定位方式 | 格式 | 示例 |
|----------|------|------|
| ID | `id:xxx` | `id:login_button` |
| Accessibility ID | `accessibility:xxx` | `accessibility:submit` |
| XPath | `xpath:xxx` | `xpath://android.widget.Button[@text='登录']` |
| Class Name | `class:xxx` | `class:android.widget.EditText` |
| Android UIAutomator | `uiautomator:xxx` | `uiautomator:text("登录")` |

### 支持的动作

| Action | 参数 | 说明 |
|--------|------|------|
| `tap` | target | 点击元素 |
| `long-press` | target | 长按元素 |
| `fill` | target, value | 输入文本 |
| `swipe` | direction | 滑动（up/down/left/right）|
| `scroll` | direction | 滚动 |
| `back` | - | 返回 |
| `home` | - | 回到桌面 |
| `wait` | value | 等待毫秒数 |
| `assert` | type, target?, value? | 断言 |
# Slickorps 测试文档

> 本文档是 Slickorps APP 的业务测试说明书，供测试人员和 AI 阅读。

---

## 1. APP 基本信息

| 属性 | 值 |
|------|-----|
| APP 名称 | Slickorps |
| 包名 | com.get.rich |
| 主 Activity | `com.get.rich.ui.SplashActivity` |
| 备用 Activity | `com.lkandzs.imtx.app.activity.ImMainActivity` |
| 平台 | Android |
| UI 框架 | Jetpack Compose |
| 测试配置文件 | `configs/financial/slickorps.demo.json` |

> ⚠️ **注意**：APP 使用 Jetpack Compose 框架，`uiautomator dump` 无法正确解析元素结构，建议使用坐标点击 + OCR 识别。

---

## 2. 测试目标

- [x] 验证登录/登出流程
- [x] 验证核心页面显示正常
- [x] 验证底部导航功能
- [x] 验证交易流程（开仓、持仓、平仓）
- [x] 验证历史记录查询
- [x] 验证余额显示正确
- [x] 验证多语言切换和显示
- [x] 检测前端/UI 问题
- [x] 检测翻译问题

---

## 3. 测试范围

### 3.1 包含的测试

| 类型 | 说明 |
|------|------|
| 登录测试 | 账号密码登录流程 |
| 页面巡检 | 首页、行情、持仓、资产等核心页面 |
| 交易测试 | 开仓 → 持仓 → 平仓完整流程 |
| 多语言测试 | 中文、英文两种语言 |
| 功能入口测试 | Deposit、Invite、About、Announcement 等 |

### 3.2 不包含的测试

| 类型 | 原因 |
|------|------|
| 充值/提现 | 涉及真实资金 |
| 实名认证 | 需要真实身份信息 |
| 复杂交易策略 | 需要人工判断 |

---

## 4. 账号信息

> ⚠️ **重要**：账号密码通过环境变量管理，不要在此文档中写明文密码。

| 环境变量 | 说明 |
|----------|------|
| `SLICKORPS_USERNAME` | 登录用户名（手机号） |
| `SLICKORPS_PASSWORD` | 登录密码 |

### .env 配置示例

```bash
# Slickorps 测试账号
SLICKORPS_USERNAME=your_phone_number
SLICKORPS_PASSWORD=your_password
```

---

## 5. 登录方式

### 5.1 登录入口

- 首页底部 Login 按钮，坐标约 `(949, 2054)`
- 或点击 Deposit/Invite 等需要登录的功能入口

### 5.2 登录流程

1. 点击首页底部 Login 按钮
2. 在弹窗中选择 Login（右侧按钮）
3. 输入手机号
4. 输入密码
5. 点击登录确认

### 5.3 关键元素定位

| 元素 | 定位方式 | 说明 |
|------|----------|------|
| Login 按钮 | 坐标 `(949, 2054)` | 首页底部 |
| 注册按钮（弹窗） | 坐标 `(328, 1992)` | 左侧 |
| 登录按钮（弹窗） | 坐标 `(752, 1992)` | 右侧 |
| 关闭弹窗 | 坐标 `(74, 169)` | 左上角 |

---

## 6. 测试顺序

### 6.1 主流程

```
1. 启动 Slickorps APP
2. 登录
3. 检查首页
4. 检查 Trading 交易页面
5. 检查 Position 持仓页面
6. 检查 Assets 资产页面
7. 开仓（可选）
8. 查看持仓
9. 平仓
10. 查看历史记录
11. 检查余额变化
12. 退出登录
13. 切换语言
14. 重复以上步骤
```

### 6.2 页面导航路径

| 页面 | 导航方式 | 前置条件 |
|------|----------|----------|
| 首页 | 启动后默认 | 登录成功 |
| Trading | 点击底部 Trading 菜单 | 在首页 |
| Position | 点击底部 Position 菜单 | 在首页 |
| Assets | 点击底部 Assets 菜单 | 在首页 |

---

## 7. 交易规则

### 7.1 开仓规则

| 参数 | 值 |
|------|-----|
| 默认品种 | EUR/USD |
| 默认方向 | 买入 |
| 默认数量 | 1 手 |
| 开仓超时 | 30 秒 |

### 7.2 平仓规则

| 参数 | 值 |
|------|-----|
| 平仓方式 | 选择第一条持仓平仓 |
| 平仓超时 | 30 秒 |

### 7.3 余额检查规则

| 规则 | 说明 |
|------|------|
| 正值检查 | 余额必须大于 0 |
| 变化检查 | 交易后余额应有变化 |

---

## 8. 页面清单

| 页面 ID | 页面名称 | 级别 | 检查项 |
|---------|----------|------|--------|
| login | 登录页面 | core | 截图、关键元素 |
| home | 首页 | core | 截图、文本检查、关键元素、语言检查 |
| trading | 交易 | core | 截图、文本检查、语言检查 |
| position | 持仓 | core | 截图、文本检查、语言检查 |
| assets | 资产 | core | 截图、文本检查、语言检查 |
| messages | 消息 | secondary | 截图、文本检查 |
| customer-service | 客服 | secondary | 截图、文本检查 |

---

## 9. 语言清单

| 语言代码 | 语言名称 | 是否执行完整流程 |
|----------|----------|------------------|
| zh-CN | 中文 | 是 |
| en-US | 英文 | 是 |

### 语言切换方式

- 切换方法：APP 内设置菜单切换
- 切换后是否需要重启 APP：是

---

## 10. 关键定位信息

### 10.1 底部导航栏（y ≈ 2228）

| 标签 | 坐标 | content-desc |
|------|------|--------------|
| Home | (142, 2228) | "Home" |
| Trading | (395, 2228) | "Trading" |
| Position | (667, 2228) | "Position" |
| Assets | (932, 2228) | "Assets" |

### 10.2 首页顶部导航（y ≈ 100-250）

| 功能 | 坐标 | content-desc |
|------|------|--------------|
| 菜单按钮 | (84, 218) | - |
| 搜索框 | (487, 219) | "Search" |
| Messages | (881, 220) | "Messages" |
| Customer Service | (976, 220) | "Customer service" |

### 10.3 首页功能按钮（y ≈ 700）

| 功能 | 坐标 | 说明 |
|------|------|------|
| Deposit | (138, 714) | 存款入口 → 需登录 |
| Invite | (402, 714) | 邀请入口 → 需登录 |
| About | (666, 714) | 关于入口 |
| Announcement | (937, 714) | 公告入口 |

### 10.4 股票排行区域

| 功能 | 坐标 | 说明 |
|------|------|------|
| Top Gainers | (152, 902) | 涨幅榜 |
| Top Losers | (436, 902) | 跌幅榜 |
| View More | (537, 1894) | 查看更多股票 |

### 10.5 Trading 页面分类

| 标签 | 说明 |
|------|------|
| Forex | 外汇交易对 |
| Commodities | 商品交易对 |
| Indices | 指数交易对 |
| Stocks | 股票交易对 |

### 10.6 外汇交易数据示例

```
AUD/JPY: Sell 110.249 / Buy 110.263
EUR/USD: Sell 1.15353 / Buy 1.15359
GBP/JPY: Sell 211.174 / Buy 211.194
```

---

## 11. 报告关注点

### 11.1 关键检查项

- P0 级问题（关键元素缺失、页面空白）
- 登录失败原因
- 交易执行成功率
- 多语言翻译问题

### 11.2 报告文件位置

```
data/reports/financial-{timestamp}/
├── report.html
├── report.json
├── screenshots/
└── page-sources/
```

---

## 12. 已知风险 / 注意事项

| 风险 | 说明 | 缓解措施 |
|------|------|----------|
| Jetpack Compose | `uiautomator dump` 无法解析元素 | 使用坐标点击 + OCR |
| 网络不稳定 | 可能导致加载超时 | 增加重试机制 |
| 账号被锁定 | 多次登录失败 | 使用测试专用账号 |
| 市场休市 | 周末无法交易 | 检查市场状态后再交易 |
| 余额不足 | 无法开仓 | 确保测试账号有足够余额 |

---

## 13. 执行命令

```bash
# 基础执行（使用配置文件）
npx autotest financial ./slickorps.apk --config ./configs/financial/slickorps.demo.json

# 仅测试中文
npx autotest financial ./slickorps.apk --config ./configs/financial/slickorps.demo.json --languages zh-CN

# 跳过交易流程
npx autotest financial ./slickorps.apk --config ./configs/financial/slickorps.demo.json --skip-trading

# 生成 JSON 报告
npx autotest financial ./slickorps.apk --config ./configs/financial/slickorps.demo.json --report html,json

# 交互式配置（无配置文件）
npx autotest financial ./slickorps.apk
```

---

## 14. 结果存放位置

| 类型 | 路径 |
|------|------|
| HTML 报告 | `data/reports/financial-{timestamp}/report.html` |
| JSON 报告 | `data/reports/financial-{timestamp}/report.json` |
| 截图 | `data/reports/financial-{timestamp}/screenshots/` |
| Page Source | `data/reports/financial-{timestamp}/page-sources/` |
| 日志 | `data/reports/financial-{timestamp}/logs/` |

---

## 15. 私有文档

如需记录敏感信息（如真实账号密码、特定配置），请使用私有文档：

```
docs/private/Slickorps.local.md
```

此目录已加入 `.gitignore`，不会提交到仓库。

---

## 16. 相关文档

- [APP-Test.md](../APP-Test.md) - APP 测试总说明
- [CLAUDE.md](../CLAUDE.md) - AI 协作与开发规范
- [configs/financial/slickorps.demo.json](../configs/financial/slickorps.demo.json) - 测试配置文件

---

*文档版本：2.0.0 | 更新时间：2026-04-05*
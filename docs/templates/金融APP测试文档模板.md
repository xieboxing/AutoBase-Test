# 金融APP测试文档模板

> 此模板用于创建新的金融 APP 测试文档。复制此文件并填充具体内容。

---

## 1. APP 基本信息

| 属性 | 值 |
|------|-----|
| APP 名称 | {APP_NAME} |
| 包名 | {PACKAGE_NAME} |
| 主 Activity | {LAUNCH_ACTIVITY} |
| APK 路径 | {APK_PATH} |
| 平台 | Android |
| 测试配置文件 | `configs/financial/{config}.json` |

---

## 2. 测试目标

- [ ] 验证登录/登出流程
- [ ] 验证核心页面显示正常
- [ ] 验证交易流程（开仓、持仓、平仓）
- [ ] 验证历史记录查询
- [ ] 验证余额显示正确
- [ ] 验证多语言切换和显示
- [ ] 检测前端/UI 问题
- [ ] 检测翻译问题

---

## 3. 测试范围

### 3.1 包含的测试

| 类型 | 说明 |
|------|------|
| 登录测试 | 账号密码登录流程 |
| 页面巡检 | 核心页面截图和检查 |
| 交易测试 | 开仓、持仓、平仓流程 |
| 多语言测试 | 中英文切换测试 |

### 3.2 不包含的测试

| 类型 | 原因 |
|------|------|
| 充值/提现 | 涉及真实资金，不适合自动化 |
| 实名认证 | 需要真实身份信息 |
| 复杂交易策略 | 需要人工判断 |

---

## 4. 账号信息

> ⚠️ **重要**：账号密码通过环境变量管理，不要在此文档中写明文密码。

| 环境变量 | 说明 | 示例值 |
|----------|------|--------|
| `{APP_NAME_UPPER}_USERNAME` | 登录用户名 | （在 .env 中配置） |
| `{APP_NAME_UPPER}_PASSWORD` | 登录密码 | （在 .env 中配置） |

### .env 配置示例

```bash
# {APP_NAME} 测试账号
{APP_NAME_UPPER}_USERNAME=test_user
{APP_NAME_UPPER}_PASSWORD=your_password_here
```

---

## 5. 登录方式

### 5.1 登录流程

1. 启动 APP
2. 等待启动页加载完成
3. 输入用户名
4. 输入密码
5. 点击登录按钮
6. 等待登录成功

### 5.2 关键元素定位

| 元素 | 定位策略 | 定位值 | 说明 |
|------|----------|--------|------|
| 用户名输入框 | xpath | `//android.widget.EditText[@hint='用户名']` | 待补充 |
| 密码输入框 | xpath | `//android.widget.EditText[@hint='密码']` | 待补充 |
| 登录按钮 | xpath | `//android.widget.Button[@text='登录']` | 待补充 |
| 登录成功指示 | xpath | `//android.widget.TextView[@text='首页']` | 待补充 |

---

## 6. 测试顺序

### 6.1 主流程

```
1. 回到手机主界面
2. 启动 APP
3. 登录
4. 检查首页
5. 检查行情页面
6. 检查持仓页面
7. 检查历史记录页面
8. 检查账户页面
9. 开仓（可选）
10. 查看持仓
11. 平仓
12. 查看历史记录
13. 检查余额变化
14. 退出登录
15. 切换语言
16. 重复以上步骤
```

### 6.2 页面导航路径

| 页面 | 导航方式 | 前置条件 |
|------|----------|----------|
| 首页 | 启动后默认 | 登录成功 |
| 行情 | 点击底部"行情"菜单 | 在首页 |
| 持仓 | 点击底部"持仓"菜单 | 在首页 |
| 历史 | 点击底部"历史"菜单 | 在首页 |
| 账户 | 点击右上角设置图标 | 在首页 |

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
| home | 首页 | core | 截图、文本检查、关键元素 |
| market | 行情 | core | 截图、文本检查 |
| position | 持仓 | core | 截图、文本检查 |
| history | 历史记录 | core | 截图、文本检查 |
| account | 账户 | secondary | 截图、文本检查 |

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

> ⚠️ **提示**：以下定位器需要在实际测试前补充完整。使用 Appium Inspector 或 UI Automator Viewer 获取。

### 10.1 登录相关

```
用户名输入框: {待补充}
密码输入框: {待补充}
登录按钮: {待补充}
登录成功指示: {待补充}
```

### 10.2 导航相关

```
首页菜单: {待补充}
行情菜单: {待补充}
持仓菜单: {待补充}
历史菜单: {待补充}
设置按钮: {待补充}
```

### 10.3 交易相关

```
品种选择: {待补充}
买入按钮: {待补充}
卖出按钮: {待补充}
数量输入框: {待补充}
确认按钮: {待补充}
平仓按钮: {待补充}
```

### 10.4 余额相关

```
余额字段: {待补充}
净值字段: {待补充}
可用余额字段: {待补充}
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
| 网络不稳定 | 可能导致加载超时 | 增加重试机制 |
| 账号被锁定 | 多次登录失败 | 使用测试专用账号 |
| 市场休市 | 无法交易 | 检查市场状态后再交易 |
| 余额不足 | 无法开仓 | 确保测试账号有足够余额 |

---

## 13. 执行命令

```bash
# 基础执行
npx autotest financial ./{app}.apk --config ./configs/financial/{config}.json

# 指定语言
npx autotest financial ./{app}.apk --config ./configs/financial/{config}.json --languages zh-CN,en-US

# 跳过交易
npx autotest financial ./{app}.apk --config ./configs/financial/{config}.json --skip-trading

# 生成 JSON 报告
npx autotest financial ./{app}.apk --config ./configs/financial/{config}.json --report html,json
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

## 15. 附录

### 15.1 定位器获取方法

1. 启动 Appium Server
2. 打开 Appium Inspector
3. 连接设备并启动 APP
4. 使用 Inspector 查看元素属性
5. 记录 resource-id、text、class 等属性
6. 构建 xpath 或 id 定位器

### 15.2 常见定位器示例

```xpath
# 通过 text 定位
//android.widget.Button[@text='登录']

# 通过 content-desc 定位
//android.widget.ImageView[@content-desc='设置']

# 通过 resource-id 定位
//android.widget.EditText[@resource-id='com.example.app:id/username']

# 组合定位
//android.widget.Button[@text='登录' and @enabled='true']
```

---

## 16. 相关文档

- [APP-Test.md](../../APP-Test.md) - APP 测试总说明
- [CLAUDE.md](../../CLAUDE.md) - AI 协作与开发规范
- [configs/financial/slickorps.demo.json](../configs/financial/slickorps.demo.json) - 配置文件示例

---

*文档版本：1.0.0 | 创建日期：{DATE}*
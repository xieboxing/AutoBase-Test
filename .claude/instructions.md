# AutoBase-Test 智能测试指令

## 🚀 启动测试时必须执行

### Step 1: 读取项目状态
```
1. 读取 `docs/Slickorps测试文档.md` - 了解APP结构和测试要求
2. 读取 `data/knowledge/elements.json` - 获取已知元素定位
3. 读取 `data/knowledge/optimization.json` - 应用优化建议
4. 读取 `data/knowledge/failure-patterns.json` - 了解已知失败模式
```

### Step 2: 检查待测试项
```
在测试文档中找到所有 [ ] 标记的未完成测试项，按优先级排序执行
```

### Step 3: 执行智能测试
```
- 使用知识库中的最优定位方式
- 遇到失败时尝试备选方案
- 失败后自动截图分析并更新知识库
```

## 📝 测试完成后必须执行

### Step 1: 生成报告
```
- HTML报告: data/reports/app-test-{timestamp}.html
- JSON报告: data/reports/app-test-{timestamp}.json
```

### Step 2: 更新知识库
```
- 保存成功的元素定位到 elements.json
- 记录失败模式到 failure-patterns.json
- 更新优化建议到 optimization.json
```

### Step 3: 更新测试文档
```
- 标记完成的测试项 [x]
- 记录发现的问题
- 补充新发现的元素定位
```

### Step 4: 输出优化摘要
```
告知用户：
1. 本次测试发现了什么
2. 知识库更新了什么
3. 下次测试会更智能的地方
```

## 🔄 自愈机制

当元素定位失败时：
1. 截图当前页面
2. 获取页面DOM
3. AI分析并给出新定位
4. 尝试新定位
5. 成功后保存到知识库

## 📂 文件路径

| 文件 | 用途 |
|------|------|
| `docs/Slickorps测试文档.md` | 测试要求和历史记录 |
| `data/knowledge/elements.json` | 元素定位映射 |
| `data/knowledge/failure-patterns.json` | 失败模式库 |
| `data/knowledge/optimization.json` | 优化记录 |
| `data/reports/` | 测试报告存储 |
| `data/screenshots/` | 截图存储 |
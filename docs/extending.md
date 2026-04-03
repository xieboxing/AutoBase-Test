# 扩展测试器指南

本文档介绍如何在 AutoBase-Test 中添加自定义测试器。

## 概述

AutoBase-Test 采用模块化设计，您可以轻松添加新的测试器来扩展功能。

## 测试器结构

一个标准的测试器包含以下方法：

```typescript
interface Tester {
  // 初始化测试器
  initialize(): Promise<void>;

  // 执行测试
  runTest(testCase: TestCase): Promise<TestCaseResult>;

  // 关闭测试器
  close(): Promise<void>;
}
```

## 创建自定义测试器

### 步骤 1：创建文件

在 `src/testers/` 下创建新目录和文件：

```
src/testers/
└── custom/
    ├── index.ts
    └── my-tester.ts
```

### 步骤 2：实现测试器类

```typescript
// src/testers/custom/my-tester.ts
import { logger } from '@/core/logger.js';
import type { TestCase, TestCaseResult, TestStep } from '@/types/index.js';
import { nanoid } from 'nanoid';

export interface MyTesterConfig {
  timeout: number;
  customOption: string;
}

const DEFAULT_CONFIG: MyTesterConfig = {
  timeout: 30000,
  customOption: 'default',
};

export class MyTester {
  private config: MyTesterConfig;
  private runId: string;

  constructor(config: Partial<MyTesterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.runId = nanoid(8);
  }

  /**
   * 初始化测试器
   */
  async initialize(): Promise<void> {
    logger.step('🔧 初始化自定义测试器', { runId: this.runId });
    // 执行初始化逻辑，如连接服务、准备资源等
  }

  /**
   * 执行测试用例
   */
  async runTest(testCase: TestCase): Promise<TestCaseResult> {
    const startTime = new Date();
    const steps: TestStepResult[] = [];

    logger.step(`📍 执行测试: ${testCase.name}`);

    try {
      // 遍历执行每个步骤
      for (const step of testCase.steps) {
        const stepResult = await this.executeStep(step);
        steps.push(stepResult);

        if (stepResult.status === 'failed') {
          break; // 步骤失败则停止
        }
      }

      const allPassed = steps.every(s => s.status === 'passed');

      return {
        caseId: testCase.id,
        caseName: testCase.name,
        status: allPassed ? 'passed' : 'failed',
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        durationMs: Date.now() - startTime.getTime(),
        platform: 'custom', // 自定义平台标识
        environment: {},
        steps,
        retryCount: 0,
        selfHealed: false,
        artifacts: { screenshots: [], logs: [] },
      };
    } catch (error) {
      logger.fail('测试执行出错', { error: String(error) });

      return {
        caseId: testCase.id,
        caseName: testCase.name,
        status: 'failed',
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        durationMs: Date.now() - startTime.getTime(),
        platform: 'custom',
        environment: {},
        steps,
        retryCount: 0,
        selfHealed: false,
        artifacts: {
          screenshots: [],
          logs: [String(error)],
        },
      };
    }
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(step: TestStep): Promise<TestStepResult> {
    const startTime = Date.now();

    try {
      switch (step.action) {
        case 'navigate':
          await this.handleNavigate(step);
          break;
        case 'click':
          await this.handleClick(step);
          break;
        case 'fill':
          await this.handleFill(step);
          break;
        case 'assert':
          await this.handleAssert(step);
          break;
        default:
          logger.warn(`未知操作: ${step.action}`);
      }

      return {
        order: step.order,
        action: step.action,
        status: 'passed',
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        order: step.order,
        action: step.action,
        status: 'failed',
        durationMs: Date.now() - startTime,
        errorMessage: String(error),
      };
    }
  }

  /**
   * 处理导航
   */
  private async handleNavigate(step: TestStep): Promise<void> {
    // 实现导航逻辑
  }

  /**
   * 处理点击
   */
  private async handleClick(step: TestStep): Promise<void> {
    // 实现点击逻辑
  }

  /**
   * 处理输入
   */
  private async handleFill(step: TestStep): Promise<void> {
    // 实现输入逻辑
  }

  /**
   * 处理断言
   */
  private async handleAssert(step: TestStep): Promise<void> {
    // 实现断言逻辑
  }

  /**
   * 关闭测试器
   */
  async close(): Promise<void> {
    logger.step('🔚 关闭自定义测试器');
    // 清理资源
  }
}
```

### 步骤 3：导出模块

```typescript
// src/testers/custom/index.ts
export { MyTester, type MyTesterConfig } from './my-tester.js';
```

### 步骤 4：注册到主测试器索引

```typescript
// src/testers/index.ts
export * from './web/index.js';
export * from './app/index.js';
export * from './custom/index.js';  // 添加这行
```

### 步骤 5：在 Orchestrator 中使用

```typescript
// src/core/orchestrator.ts
import { MyTester } from '@/testers/custom/index.js';

// 在 executeCases 方法中添加平台判断
if (this.platform === 'custom') {
  const tester = new MyTester({
    timeout: this.internalConfig.timeoutMs,
    customOption: '...',
  });

  await tester.initialize();
  const result = await tester.runTest(testCase);
  await tester.close();
}
```

## 创建自定义 CLI 命令

如果需要添加新的 CLI 命令：

### 步骤 1：创建命令文件

```typescript
// src/cli/commands/test-custom.ts
import { Command } from 'commander';
import chalk from 'chalk';
import { MyTester } from '@/testers/custom/index.js';

export function createCustomCommand(): Command {
  const command = new Command('custom');

  command
    .description('执行自定义测试')
    .argument('<target>', '测试目标')
    .option('--option <value>', '自定义选项')
    .action(async (target: string, options: { option?: string }) => {
      console.log(chalk.blue.bold('🎯 执行自定义测试'));

      const tester = new MyTester({
        customOption: options.option || 'default',
      });

      try {
        await tester.initialize();
        // 执行测试...
        await tester.close();

        console.log(chalk.green.bold('\n✅ 测试完成'));
      } catch (error) {
        console.log(chalk.red(`测试失败: ${(error as Error).message}`));
      }
    });

  return command;
}
```

### 步骤 2：注册命令

```typescript
// src/cli/index.ts
import { createCustomCommand } from './commands/test-custom.js';

// 在命令注册部分添加
program.addCommand(createCustomCommand());
```

## 测试自定义测试器

创建单元测试：

```typescript
// tests/unit/testers/custom/my-tester.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MyTester } from '@/testers/custom/my-tester.js';

describe('MyTester', () => {
  let tester: MyTester;

  beforeEach(async () => {
    tester = new MyTester({ timeout: 5000 });
    await tester.initialize();
  });

  afterEach(async () => {
    await tester.close();
  });

  it('should initialize correctly', () => {
    expect(tester).toBeDefined();
  });

  it('should run test case', async () => {
    const testCase = {
      id: 'test-001',
      name: '测试用例',
      steps: [
        { order: 1, action: 'navigate', target: '/test' },
      ],
    };

    const result = await tester.runTest(testCase);
    expect(result.caseId).toBe('test-001');
  });
});
```

## 最佳实践

1. **错误处理**：所有异步操作都要 try-catch
2. **日志记录**：使用 logger 记录关键操作
3. **资源清理**：在 close() 中释放所有资源
4. **配置化**：通过配置对象支持自定义
5. **类型安全**：使用 TypeScript 类型定义

## 示例：数据库测试器

```typescript
// src/testers/database/db-tester.ts
import { logger } from '@/core/logger.js';
import type { TestCase, TestCaseResult } from '@/types/index.js';

export interface DbTesterConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export class DbTester {
  private config: DbTesterConfig;
  private connection: any = null;

  constructor(config: DbTesterConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    logger.step('🔌 连接数据库', { host: this.config.host });
    // this.connection = await createConnection(this.config);
  }

  async runTest(testCase: TestCase): Promise<TestCaseResult> {
    // 执行数据库测试
    // ...
  }

  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
    }
  }
}
```

## 示例：消息队列测试器

```typescript
// src/testers/mq/mq-tester.ts
import { logger } from '@/core/logger.js';
import type { TestCase, TestCaseResult } from '@/types/index.js';

export interface MqTesterConfig {
  brokerUrl: string;
  queueName: string;
}

export class MqTester {
  private config: MqTesterConfig;

  constructor(config: MqTesterConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    logger.step('📨 连接消息队列', { broker: this.config.brokerUrl });
  }

  async runTest(testCase: TestCase): Promise<TestCaseResult> {
    // 发送/接收消息测试
    // ...
  }

  async close(): Promise<void> {
    // 断开连接
  }
}
```

## 总结

扩展 AutoBase-Test 的步骤：

1. 创建测试器类，实现 `initialize`, `runTest`, `close` 方法
2. 导出模块
3. 注册到 Orchestrator
4. （可选）创建 CLI 命令
5. 编写单元测试

遵循这些步骤，您可以轻松扩展平台功能，支持任何类型的自动化测试。
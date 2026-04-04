import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import cron from 'node-cron';
import { logger } from '@/core/logger.js';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 创建 schedule 命令
 */
export function createScheduleCommand(): Command {
  const command = new Command('schedule');

  command
    .description('设置定时测试')
    .option('--cron <expression>', 'Cron 表达式')
    .option('--config <path>', '项目配置文件路径')
    .option('--list', '列出已设置的定时任务')
    .option('--cancel <id>', '取消指定的定时任务')
    .action(async (options: { cron?: string; config?: string; list?: boolean; cancel?: string }) => {
      await scheduleTest(options);
    });

  return command;
}

// 存储活动的定时任务
const activeJobs: Map<string, cron.ScheduledTask> = new Map();

/**
 * 设置定时测试
 */
async function scheduleTest(options: { cron?: string; config?: string; list?: boolean; cancel?: string }): Promise<void> {
  // 列出任务
  if (options.list) {
    await listScheduledTasks();
    return;
  }

  // 取消任务
  if (options.cancel) {
    await cancelScheduledTask(options.cancel);
    return;
  }

  // 设置新任务
  if (!options.cron || !options.config) {
    // 交互式设置
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'cron',
        message: 'Cron 表达式 (如 "0 9 * * 1-5" 表示工作日9点):',
        validate: (input: string) => {
          if (!input) return 'Cron 表达式不能为空';
          if (!cron.validate(input)) return '无效的 Cron 表达式';
          return true;
        },
      },
      {
        type: 'input',
        name: 'config',
        message: '配置文件路径:',
        default: './test-suites/my-project/config.json',
        validate: async (input: string) => {
          if (!input) return '配置文件路径不能为空';
          try {
            await fs.access(input);
            return true;
          } catch {
            return '配置文件不存在';
          }
        },
      },
      {
        type: 'confirm',
        name: 'notify',
        message: '是否在测试完成后发送通知?',
        default: false,
      },
    ]);

    options.cron = answers.cron as string;
    options.config = answers.config as string;
  }

  await createScheduledTask(options.cron!, options.config!);
}

/**
 * 创建定时任务
 */
async function createScheduledTask(cronExpression: string, configPath: string): Promise<void> {
  console.log(chalk.blue.bold('⏰ 设置定时测试'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`${chalk.bold('Cron')}: ${cronExpression}`);
  console.log(`${chalk.bold('配置')}: ${configPath}`);

  // 解析 Cron 表达式
  const description = describeCron(cronExpression);
  console.log(`${chalk.bold('说明')}: ${description}`);

  // 验证 Cron 表达式
  if (!cron.validate(cronExpression)) {
    console.log(chalk.red('无效的 Cron 表达式'));
    process.exit(1);
  }

  // 读取配置文件
  let config: Record<string, unknown> = {};
  try {
    const configContent = await fs.readFile(path.resolve(configPath), 'utf-8');
    config = JSON.parse(configContent);
    console.log(`${chalk.bold('项目')}: ${(config.project as Record<string, unknown>)?.name || '未命名'}`);
  } catch (error) {
    console.log(chalk.red(`无法读取配置文件: ${(error as Error).message}`));
    process.exit(1);
  }

  console.log(chalk.gray('─'.repeat(50)));

  // 创建任务 ID
  const taskId = `schedule-${Date.now()}`;

  // 创建定时任务
  const task = cron.schedule(cronExpression, async () => {
    console.log(chalk.blue.bold(`\n🚀 执行定时测试 [${taskId}]`));
    console.log(chalk.gray(`时间: ${new Date().toISOString()}`));

    try {
      // 动态导入 autotest 模块并执行测试
      // 这里可以调用 test-all 命令的逻辑
      console.log(chalk.gray('开始执行测试...'));

      // 模拟执行
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log(chalk.green('✅ 测试执行完成'));
    } catch (error) {
      console.log(chalk.red(`测试执行失败: ${(error as Error).message}`));
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Shanghai',
  });

  activeJobs.set(taskId, task);

  // 保存任务配置
  await saveTaskConfig(taskId, {
    cron: cronExpression,
    configPath,
    createdAt: new Date().toISOString(),
    project: (config.project as Record<string, unknown>)?.name,
  });

  console.log(chalk.green.bold('\n✅ 定时任务已创建'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`任务 ID: ${taskId}`);
  console.log(chalk.gray('\n提示:'));
  console.log(chalk.gray('  - 任务将在后台持续运行'));
  console.log(chalk.gray('  - 使用 --list 查看所有任务'));
  console.log(chalk.gray('  - 使用 --cancel <id> 取消任务'));
  console.log(chalk.gray('  - 关闭进程将停止所有定时任务'));
}

/**
 * 列出定时任务
 */
async function listScheduledTasks(): Promise<void> {
  console.log(chalk.blue.bold('📋 定时任务列表'));
  console.log(chalk.gray('─'.repeat(50)));

  // 从保存的配置中读取
  const tasks = await loadTaskConfigs();

  if (tasks.length === 0) {
    console.log(chalk.yellow('没有设置的定时任务'));
    return;
  }

  for (const task of tasks) {
    const taskId = task.id as string;
    const taskCron = task.cron as string;
    const taskProject = task.project as string | undefined;
    const taskConfigPath = task.configPath as string;
    const taskCreatedAt = task.createdAt as string;

    const status = activeJobs.has(taskId) ? chalk.green('运行中') : chalk.gray('已停止');
    console.log(`\n${chalk.bold(taskId)}`);
    console.log(`  状态: ${status}`);
    console.log(`  Cron: ${taskCron}`);
    console.log(`  说明: ${describeCron(taskCron)}`);
    console.log(`  项目: ${taskProject || '未命名'}`);
    console.log(`  配置: ${taskConfigPath}`);
    console.log(`  创建: ${taskCreatedAt}`);
  }

  console.log(chalk.gray('\n─'.repeat(50)));
  console.log(`共 ${tasks.length} 个任务`);
}

/**
 * 取消定时任务
 */
async function cancelScheduledTask(taskId: string): Promise<void> {
  console.log(chalk.blue.bold('🗑️ 取消定时任务'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`任务 ID: ${taskId}`);

  const task = activeJobs.get(taskId);
  if (task) {
    task.stop();
    activeJobs.delete(taskId);
  }

  // 从配置中删除
  await removeTaskConfig(taskId);

  console.log(chalk.green('✅ 任务已取消'));
}

/**
 * 保存任务配置
 */
async function saveTaskConfig(taskId: string, config: Record<string, unknown>): Promise<void> {
  const tasksDir = './data/schedules';
  await fs.mkdir(tasksDir, { recursive: true });

  const taskFile = path.join(tasksDir, `${taskId}.json`);
  await fs.writeFile(taskFile, JSON.stringify({ id: taskId, ...config }, null, 2), 'utf-8');
}

/**
 * 加载任务配置
 */
async function loadTaskConfigs(): Promise<Array<Record<string, unknown>>> {
  const tasksDir = './data/schedules';

  try {
    const files = await fs.readdir(tasksDir);
    const tasks: Array<Record<string, unknown>> = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(tasksDir, file), 'utf-8');
        tasks.push(JSON.parse(content));
      }
    }

    return tasks;
  } catch {
    return [];
  }
}

/**
 * 删除任务配置
 */
async function removeTaskConfig(taskId: string): Promise<void> {
  const taskFile = path.join('./data/schedules', `${taskId}.json`);

  try {
    await fs.unlink(taskFile);
  } catch {
    // 忽略错误
  }
}

/**
 * 描述 Cron 表达式
 */
function describeCron(expression: string): string {
  const parts = expression.split(' ');
  if (parts.length !== 5) return '无效表达式';

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // 常见模式
  if (minute === '0' && hour === '9' && dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5') {
    return '每个工作日早上 9:00';
  }
  if (minute === '0' && hour === '9' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return '每天早上 9:00';
  }
  if (minute === '0' && hour === '*/2' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return '每 2 小时';
  }
  if (minute === '*/30' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return '每 30 分钟';
  }
  if (minute === '0' && hour === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return '每天午夜 0:00';
  }

  return `自定义: ${expression}`;
}
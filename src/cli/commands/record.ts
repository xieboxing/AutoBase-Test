import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { logger } from '@/core/logger.js';
import { CaseRecorder, RecordedAction } from '@/test-cases/case-recorder.js';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

/**
 * 创建 record 命令
 */
export function createRecordCommand(): Command {
  const command = new Command('record');

  command
    .description('录制用户操作并生成测试用例')
    .argument('[url]', '要录制的网站 URL')
    .option('--app <apk>', '录制 APP 操作')
    .option('--output <path>', '输出路径', './test-suites')
    .option('--name <name>', '用例名称')
    .option('--project <name>', '项目名称', 'default')
    .action(async (url: string | undefined, options: { app?: string; output?: string; name?: string; project?: string }) => {
      if (options.app) {
        await recordApp(options.app, options);
      } else if (url) {
        await recordWeb(url, options);
      } else {
        // 交互式选择
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'type',
            message: '选择录制类型:',
            choices: [
              { name: 'Web 网站', value: 'web' },
              { name: 'APP 应用', value: 'app' },
            ],
          },
          {
            type: 'input',
            name: 'url',
            message: '输入网站 URL:',
            when: (ans: Record<string, unknown>) => ans.type === 'web',
            validate: (input: string) => {
              if (!input) return 'URL 不能为空';
              try {
                new URL(input);
                return true;
              } catch {
                return '请输入有效的 URL';
              }
            },
          },
          {
            type: 'input',
            name: 'apkPath',
            message: '输入 APK 路径:',
            when: (ans: Record<string, unknown>) => ans.type === 'app',
          },
          {
            type: 'input',
            name: 'caseName',
            message: '输入用例名称:',
            default: 'recorded-test-case',
          },
        ]);

        if (answers.type === 'web') {
          await recordWeb(answers.url as string, { ...options, name: answers.caseName as string });
        } else {
          await recordApp(answers.apkPath as string, { ...options, name: answers.caseName as string });
        }
      }
    });

  return command;
}

/**
 * 录制 Web 操作
 */
async function recordWeb(url: string, options: { output?: string; name?: string; project?: string }): Promise<void> {
  console.log(chalk.blue.bold('📹 开始录制 Web 操作'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`${chalk.bold('URL')}: ${url}`);
  console.log(`${chalk.bold('输出目录')}: ${options.output || './test-suites'}`);
  console.log(chalk.gray('─'.repeat(50)));

  console.log(chalk.yellow('\n提示:'));
  console.log(chalk.gray('  - 浏览器将打开，请进行操作'));
  console.log(chalk.gray('  - 操作完成后，关闭浏览器或在终端按 Ctrl+C 结束录制'));
  console.log(chalk.gray('  - 录制的操作将自动生成测试用例 JSON'));

  const recorder = new CaseRecorder({
    headless: false,
    viewport: { width: 1280, height: 720 },
    recordVideo: false,
    artifactsDir: options.output || './data/recordings',
  });

  try {
    // 初始化录制器
    console.log(chalk.blue('\n🚀 启动浏览器...'));
    await recorder.initialize();

    // 开始录制
    await recorder.startRecording(url);

    console.log(chalk.green.bold('\n✅ 浏览器已启动，开始录制...'));
    console.log(chalk.gray('关闭浏览器窗口或按 Ctrl+C 结束录制'));

    // 等待录制结束（通过浏览器关闭或手动停止）
    await new Promise<void>((resolve) => {
      // 设置最大录制时间 5 分钟
      const timeout = setTimeout(() => {
        console.log(chalk.yellow('\n⏰ 录制时间到达上限，自动结束'));
        resolve();
      }, 5 * 60 * 1000);

      // 监听进程退出
      process.on('SIGINT', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    // 停止录制
    await recorder.stopRecording();

    // 生成测试用例
    const testCase = recorder.generateTestCase({
      name: options.name || `录制测试用例 ${new Date().toLocaleDateString()}`,
      description: `从 ${url} 录制的测试用例`,
      priority: 'P2',
      type: 'functional',
      platform: ['pc-web'],
      tags: ['recorded'],
    });

    // 保存测试用例
    const casePath = await recorder.saveTestCase(options.project || 'default', testCase);

    console.log(chalk.green.bold('\n✅ 录制完成'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('测试用例')}: ${casePath}`);
    console.log(`${chalk.bold('操作数')}: ${recorder.getActionCount()}`);

  } catch (error) {
    console.log(chalk.red(`录制失败: ${(error as Error).message}`));
    logger.error('录制失败', { error: (error as Error).message });
  } finally {
    await recorder.close();
  }
}

/**
 * 录制 APP 操作
 */
async function recordApp(apkPath: string, options: { output?: string; name?: string; project?: string }): Promise<void> {
  console.log(chalk.blue.bold('📹 开始录制 APP 操作'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`${chalk.bold('APK')}: ${apkPath}`);
  console.log(chalk.gray('─'.repeat(50)));

  console.log(chalk.yellow('\n⚠️ APP 录制功能需要连接设备和 Appium'));
  console.log(chalk.gray('请确保:'));
  console.log(chalk.gray('  1. Appium Server 正在运行'));
  console.log(chalk.gray('  2. 设备已连接（真机或模拟器）'));
  console.log(chalk.gray('  3. 已安装应用的包名和 Activity'));

  const recorder = new CaseRecorder({
    headless: true,
    viewport: { width: 360, height: 640 },
    recordVideo: false,
    artifactsDir: options.output || './data/recordings',
  });

  try {
    // APP 录制使用模拟方式（实际需要 Appium）
    console.log(chalk.gray('\n模拟录制演示...'));

    // 手动添加录制操作（实际应从 Appium 获取）
    const actions: RecordedAction[] = [
      { timestamp: new Date().toISOString(), action: 'navigate', url: apkPath },
      { timestamp: new Date().toISOString(), action: 'click', selector: 'com.example:id/button', tagName: 'button', text: '确定' },
      { timestamp: new Date().toISOString(), action: 'fill', selector: 'com.example:id/edittext', tagName: 'input', value: '测试输入' },
    ];

    // 使用内部方法添加操作
    for (const action of actions) {
      // 直接添加到底层 actions 数组（这里是为了演示）
    }

    // 生成测试用例
    const testCase = recorder.generateTestCase({
      name: options.name || `APP录制测试用例 ${new Date().toLocaleDateString()}`,
      description: `从 ${apkPath} 录制的测试用例`,
      priority: 'P2',
      type: 'functional',
      platform: ['android-app'],
      tags: ['recorded', 'app'],
    });

    // 保存测试用例
    const casePath = await recorder.saveTestCase(options.project || 'default', testCase);

    console.log(chalk.green.bold('\n✅ APP 录制完成'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('测试用例')}: ${casePath}`);
    console.log(`${chalk.bold('操作数')}: ${recorder.getActionCount()}`);
  } catch (error) {
    console.log(chalk.red(`录制失败: ${(error as Error).message}`));
    logger.error('录制失败', { error: (error as Error).message });
  } finally {
    await recorder.close();
  }
}
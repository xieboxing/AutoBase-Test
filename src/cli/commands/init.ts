import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 创建 init 命令
 */
export function createInitCommand(): Command {
  const command = new Command('init');

  command
    .description('交互式创建项目测试配置')
    .argument('[project-name]', '项目名称')
    .action(async (projectName: string | undefined) => {
      await initProject(projectName);
    });

  return command;
}

/**
 * 初始化项目
 */
async function initProject(projectName: string | undefined): Promise<void> {
  console.log(chalk.blue.bold('🎯 初始化项目'));
  console.log(chalk.gray('─'.repeat(50)));

  // 交互式提问
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectName',
      message: '项目名称:',
      default: projectName || 'my-project',
      validate: (input: string) => {
        if (!input) return '项目名称不能为空';
        if (!/^[a-zA-Z0-9_-]+$/.test(input)) return '只能包含字母、数字、下划线和连字符';
        return true;
      },
    },
    {
      type: 'input',
      name: 'projectDescription',
      message: '项目描述:',
      default: '',
    },
    {
      type: 'checkbox',
      name: 'testTargets',
      message: '选择测试目标:',
      choices: [
        { name: 'Web 网站', value: 'web', checked: true },
        { name: 'H5 移动端', value: 'h5' },
        { name: 'APP 应用', value: 'app' },
        { name: 'API 接口', value: 'api' },
      ],
    },
    {
      type: 'input',
      name: 'webUrl',
      message: 'Web 网站 URL:',
      when: (ans: Record<string, unknown>) => (ans.testTargets as string[]).includes('web'),
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
      name: 'h5Url',
      message: 'H5 移动端 URL:',
      when: (ans: Record<string, unknown>) => (ans.testTargets as string[]).includes('h5'),
    },
    {
      type: 'input',
      name: 'apkPath',
      message: 'APK 文件路径:',
      when: (ans: Record<string, unknown>) => (ans.testTargets as string[]).includes('app'),
    },
    {
      type: 'input',
      name: 'packageName',
      message: '应用包名 (如 com.example.app):',
      when: (ans: Record<string, unknown>) => (ans.testTargets as string[]).includes('app'),
    },
    {
      type: 'input',
      name: 'apiBaseUrl',
      message: 'API 基础 URL:',
      when: (ans: Record<string, unknown>) => (ans.testTargets as string[]).includes('api'),
    },
    {
      type: 'confirm',
      name: 'needLogin',
      message: '是否需要登录测试?',
      default: false,
    },
    {
      type: 'input',
      name: 'loginUrl',
      message: '登录页面路径 (如 /login):',
      when: (ans: Record<string, unknown>) => ans.needLogin,
    },
    {
      type: 'input',
      name: 'loginUsername',
      message: '登录用户名:',
      when: (ans: Record<string, unknown>) => ans.needLogin,
    },
    {
      type: 'password',
      name: 'loginPassword',
      message: '登录密码:',
      mask: '*',
      when: (ans: Record<string, unknown>) => ans.needLogin,
    },
    {
      type: 'number',
      name: 'testDepth',
      message: 'AI 探索深度:',
      default: 3,
    },
    {
      type: 'number',
      name: 'timeout',
      message: '单步超时 (秒):',
      default: 30,
    },
    {
      type: 'number',
      name: 'retryCount',
      message: '失败重试次数:',
      default: 2,
    },
    {
      type: 'checkbox',
      name: 'reportFormats',
      message: '报告格式:',
      choices: [
        { name: 'HTML', value: 'html', checked: true },
        { name: 'JSON', value: 'json' },
        { name: 'Markdown', value: 'markdown' },
      ],
    },
    {
      type: 'confirm',
      name: 'enableSchedule',
      message: '是否启用定时测试?',
      default: false,
    },
    {
      type: 'input',
      name: 'scheduleCron',
      message: 'Cron 表达式 (如 "0 9 * * 1-5" 表示工作日9点):',
      when: (ans: Record<string, unknown>) => ans.enableSchedule,
      default: '0 9 * * 1-5',
    },
  ]);

  // 构建配置对象
  const config = buildConfig(answers as Record<string, unknown>);

  // 创建项目目录
  const projectDir = path.join('./test-suites', answers.projectName as string);

  try {
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, 'cases'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'reports'), { recursive: true });

    // 写入配置文件
    const configPath = path.join(projectDir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // 创建示例测试用例
    const exampleCase = createExampleCase(answers as Record<string, unknown>);
    const casePath = path.join(projectDir, 'cases', 'example-smoke.case.json');
    await fs.writeFile(casePath, JSON.stringify(exampleCase, null, 2), 'utf-8');

    // 创建 README
    const readmeContent = createReadme(answers as Record<string, unknown>);
    await fs.writeFile(path.join(projectDir, 'README.md'), readmeContent, 'utf-8');

    console.log(chalk.green.bold('\n✅ 项目初始化完成'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('项目目录')}: ${projectDir}`);
    console.log(`${chalk.bold('配置文件')}: ${configPath}`);
    console.log(`${chalk.bold('示例用例')}: ${casePath}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log('\n下一步:');
    console.log(chalk.cyan(`  1. 编辑配置文件: ${configPath}`));
    console.log(chalk.cyan(`  2. 添加测试用例到: ${path.join(projectDir, 'cases')}`));
    console.log(chalk.cyan(`  3. 运行测试: npx autotest all --config ${configPath}`));

  } catch (error) {
    console.log(chalk.red(`初始化失败: ${(error as Error).message}`));
    process.exit(1);
  }
}

/**
 * 构建配置对象
 */
function buildConfig(answers: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = {
    project: {
      name: answers.projectName,
      description: answers.projectDescription || '',
    },
    targets: {},
    settings: {
      testDepth: answers.testDepth || 3,
      timeout: (answers.timeout as number) * 1000,
      retryCount: answers.retryCount || 2,
      parallelism: 3,
      screenshotOnFailure: true,
      videoOnFailure: true,
      enableAiOptimization: true,
      reportFormats: answers.reportFormats || ['html'],
    },
  };

  // Web 目标
  if ((answers.testTargets as string[]).includes('web') && answers.webUrl) {
    config.targets = {
      ...config.targets as object,
      web: {
        url: answers.webUrl,
        ...(answers.needLogin && {
          loginUrl: answers.loginUrl,
          credentials: {
            username: answers.loginUsername,
            password: 'env:TEST_PASSWORD',
          },
        }),
      },
    };
  }

  // H5 目标
  if ((answers.testTargets as string[]).includes('h5') && answers.h5Url) {
    config.targets = {
      ...config.targets as object,
      h5: {
        url: answers.h5Url,
        devices: ['iPhone 15', 'Pixel 7'],
      },
    };
  }

  // APP 目标
  if ((answers.testTargets as string[]).includes('app')) {
    config.targets = {
      ...config.targets as object,
      app: {
        apkPath: answers.apkPath,
        packageName: answers.packageName,
      },
    };
  }

  // API 目标
  if ((answers.testTargets as string[]).includes('api') && answers.apiBaseUrl) {
    config.targets = {
      ...config.targets as object,
      api: {
        baseUrl: answers.apiBaseUrl,
      },
    };
  }

  // 定时任务
  if (answers.enableSchedule) {
    config.schedule = {
      enabled: true,
      cron: answers.scheduleCron,
    };
  }

  return config;
}

/**
 * 创建示例测试用例
 */
function createExampleCase(answers: Record<string, unknown>): Record<string, unknown> {
  const platforms: string[] = [];
  if ((answers.testTargets as string[]).includes('web')) platforms.push('pc-web');
  if ((answers.testTargets as string[]).includes('h5')) platforms.push('h5-web');

  return {
    id: 'tc-example-001',
    name: '示例冒烟测试',
    description: '验证页面能正常加载',
    priority: 'P0',
    type: 'functional',
    platform: platforms.length > 0 ? platforms : ['pc-web'],
    tags: ['smoke', 'example'],
    steps: [
      {
        order: 1,
        action: 'navigate',
        target: '/',
        description: '打开首页',
      },
      {
        order: 2,
        action: 'assert',
        type: 'element-visible',
        target: 'body',
        description: '验证页面加载完成',
      },
    ],
    metadata: {
      author: 'Auto-generated',
      created: new Date().toISOString(),
    },
  };
}

/**
 * 创建 README
 */
function createReadme(answers: Record<string, unknown>): string {
  return `# ${answers.projectName}

${answers.projectDescription || '测试项目'}

## 测试目标

${(answers.testTargets as string[]).map(t => `- ${t}`).join('\n')}

## 运行测试

\`\`\`bash
# 运行所有测试
npx autotest all --config ./config.json

# 仅运行 Web 测试
npx autotest web ${answers.webUrl || '<URL>'}

# 查看报告
npx autotest report --latest
\`\`\`

## 目录结构

\`\`\`
${answers.projectName}/
├── config.json      # 项目配置
├── cases/           # 测试用例
│   └── example-smoke.case.json
├── reports/         # 测试报告
└── README.md        # 本文件
\`\`\`

## 配置说明

编辑 \`config.json\` 文件来修改测试设置。

## 用例编写

在 \`cases/\` 目录下创建 \`.case.json\` 文件来添加新的测试用例。
`;
}
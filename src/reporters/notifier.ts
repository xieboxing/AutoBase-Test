import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { logger } from '@/core/logger.js';
import type { TestRunResult } from '@/types/index.js';

/**
 * 通知配置
 */
export interface NotificationConfig {
  /** 邮件通知配置 */
  email?: EmailConfig;
  /** Webhook 通知配置 */
  webhook?: WebhookConfig;
}

/**
 * 邮件通知配置
 */
export interface EmailConfig {
  /** SMTP 服务器地址 */
  host: string;
  /** SMTP 端口 */
  port: number;
  /** 是否使用 SSL */
  secure?: boolean;
  /** SMTP 用户名 */
  user: string;
  /** SMTP 密码 */
  password: string;
  /** 发件人地址 */
  from: string;
  /** 收件人地址列表 */
  to: string[];
}

/**
 * Webhook 通知配置
 */
export interface WebhookConfig {
  /** Webhook 类型 */
  type: 'slack' | 'feishu' | 'wecom' | 'dingtalk' | 'custom';
  /** Webhook URL */
  url: string;
  /** 自定义请求头 */
  headers?: Record<string, string>;
  /** 密钥（用于签名验证）*/
  secret?: string;
}

/**
 * 通知内容
 */
export interface NotificationPayload {
  /** 项目名称 */
  project: string;
  /** 运行 ID */
  runId: string;
  /** 通过率 */
  passRate: number;
  /** 总用例数 */
  total: number;
  /** 通过数 */
  passed: number;
  /** 失败数 */
  failed: number;
  /** 风险等级 */
  riskLevel: string;
  /** 关键问题数 */
  criticalIssues: number;
  /** 报告链接 */
  reportUrl?: string;
  /** 测试耗时 */
  duration: number;
  /** 测试时间 */
  startTime: string;
  /** 平台 */
  platform: string;
}

/**
 * 通知器类
 * 支持邮件和多种 Webhook 通知
 */
export class Notifier {
  private config: NotificationConfig;
  private emailTransporter: nodemailer.Transporter | null = null;

  constructor(config: NotificationConfig) {
    this.config = config;
    this.initEmailTransporter();
  }

  /**
   * 初始化邮件传输器
   */
  private initEmailTransporter(): void {
    if (this.config.email) {
      try {
        this.emailTransporter = nodemailer.createTransport({
          host: this.config.email.host,
          port: this.config.email.port,
          secure: this.config.email.secure ?? this.config.email.port === 465,
          auth: {
            user: this.config.email.user,
            pass: this.config.email.password,
          },
          // 添加连接超时和错误处理
          connectionTimeout: 10000,
          socketTimeout: 10000,
        });

        // 验证连接配置（异步，不阻塞初始化）
        this.emailTransporter.verify((error) => {
          if (error) {
            logger.warn('邮件服务器连接验证失败', { error: error.message });
            // 验证失败时清理传输器，避免后续使用无效连接
            this.emailTransporter = null;
          } else {
            logger.info('邮件服务器连接验证成功');
          }
        });
      } catch (error) {
        logger.error('邮件传输器初始化失败', { error: String(error) });
        this.emailTransporter = null;
      }
    }
  }

  /**
   * 发送所有通知
   */
  async sendAll(result: TestRunResult, reportUrl?: string): Promise<void> {
    const payload = this.buildPayload(result, reportUrl);

    const promises: Promise<void>[] = [];

    if (this.config.email) {
      promises.push(this.sendEmail(payload));
    }

    if (this.config.webhook) {
      promises.push(this.sendWebhook(payload));
    }

    await Promise.allSettled(promises);
  }

  /**
   * 构建通知内容
   */
  private buildPayload(result: TestRunResult, reportUrl?: string): NotificationPayload {
    return {
      project: result.project,
      runId: result.runId,
      passRate: result.summary.passRate,
      total: result.summary.total,
      passed: result.summary.passed,
      failed: result.summary.failed,
      riskLevel: result.aiAnalysis?.riskLevel ?? 'unknown',
      criticalIssues: result.aiAnalysis?.criticalIssues.length ?? 0,
      reportUrl,
      duration: result.duration,
      startTime: result.startTime,
      platform: result.platform,
    };
  }

  /**
   * 发送邮件通知
   */
  async sendEmail(payload: NotificationPayload): Promise<void> {
    if (!this.config.email || !this.emailTransporter) {
      logger.warn('邮件通知未配置');
      return;
    }

    const passRatePercent = (payload.passRate * 100).toFixed(1);
    const durationStr = this.formatDuration(payload.duration);
    const statusEmoji = payload.passRate >= 0.8 ? '✅' : payload.passRate >= 0.5 ? '⚠️' : '❌';
    const riskEmoji = this.getRiskEmoji(payload.riskLevel);

    const subject = `${statusEmoji} ${payload.project} 测试完成 - 通过率 ${passRatePercent}%`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 10px 10px; }
    .stats { display: flex; justify-content: space-around; margin: 20px 0; }
    .stat-box { background: white; padding: 15px 25px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .stat-value { font-size: 24px; font-weight: bold; }
    .stat-label { color: #666; font-size: 12px; }
    .passed { color: #22c55e; }
    .failed { color: #ef4444; }
    .warning { color: #f59e0b; }
    .risk-low { color: #22c55e; }
    .risk-medium { color: #f59e0b; }
    .risk-high { color: #ef4444; }
    .risk-critical { color: #dc2626; }
    .btn { display: inline-block; padding: 10px 20px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; }
    .footer { margin-top: 20px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">${statusEmoji} 测试报告</h1>
      <p style="margin: 10px 0 0 0;">${payload.project} - ${payload.runId}</p>
    </div>
    <div class="content">
      <div class="stats">
        <div class="stat-box">
          <div class="stat-value passed">${payload.passed}</div>
          <div class="stat-label">通过</div>
        </div>
        <div class="stat-box">
          <div class="stat-value failed">${payload.failed}</div>
          <div class="stat-label">失败</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${payload.total}</div>
          <div class="stat-label">总数</div>
        </div>
        <div class="stat-box">
          <div class="stat-value ${payload.passRate >= 0.8 ? 'passed' : payload.passRate >= 0.5 ? 'warning' : 'failed'}">${passRatePercent}%</div>
          <div class="stat-label">通过率</div>
        </div>
      </div>

      <p><strong>测试平台:</strong> ${payload.platform}</p>
      <p><strong>耗时:</strong> ${durationStr}</p>
      <p><strong>风险等级:</strong> <span class="risk-${payload.riskLevel}">${riskEmoji} ${payload.riskLevel.toUpperCase()}</span></p>
      <p><strong>关键问题:</strong> ${payload.criticalIssues} 个</p>

      ${payload.reportUrl ? `<p style="text-align: center; margin-top: 20px;"><a class="btn" href="${payload.reportUrl}">查看详细报告</a></p>` : ''}

      <div class="footer">
        <p>测试时间: ${payload.startTime}</p>
        <p>由 AutoTest Platform 自动发送</p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();

    const textBody = `
${payload.project} 测试完成

运行 ID: ${payload.runId}
状态: ${statusEmoji} 通过率 ${passRatePercent}%

统计:
- 通过: ${payload.passed}
- 失败: ${payload.failed}
- 总数: ${payload.total}

平台: ${payload.platform}
耗时: ${durationStr}
风险等级: ${payload.riskLevel.toUpperCase()}
关键问题: ${payload.criticalIssues} 个

${payload.reportUrl ? `查看报告: ${payload.reportUrl}` : '无报告链接'}

测试时间: ${payload.startTime}
    `.trim();

    try {
      const info = await this.emailTransporter.sendMail({
        from: this.config.email.from,
        to: this.config.email.to.join(','),
        subject,
        text: textBody,
        html: htmlBody,
      });

      logger.info('邮件通知发送成功', { messageId: info.messageId });
    } catch (error) {
      logger.error('邮件通知发送失败', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 发送 Webhook 通知
   */
  async sendWebhook(payload: NotificationPayload): Promise<void> {
    if (!this.config.webhook) {
      logger.warn('Webhook 通知未配置');
      return;
    }

    const { type, url, headers, secret } = this.config.webhook;
    let body: string | object;
    const webhookHeaders: Record<string, string> = { ...headers };

    switch (type) {
      case 'slack':
        body = this.buildSlackPayload(payload);
        webhookHeaders['Content-Type'] = 'application/json';
        break;

      case 'feishu':
        body = this.buildFeishuPayload(payload);
        webhookHeaders['Content-Type'] = 'application/json';
        break;

      case 'wecom':
        body = this.buildWecomPayload(payload);
        webhookHeaders['Content-Type'] = 'application/json';
        break;

      case 'dingtalk':
        body = this.buildDingtalkPayload(payload, secret);
        webhookHeaders['Content-Type'] = 'application/json';
        break;

      case 'custom':
        body = payload;
        webhookHeaders['Content-Type'] = 'application/json';
        break;

      default:
        throw new Error(`不支持的 Webhook 类型: ${type}`);
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: webhookHeaders,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Webhook 请求失败: ${response.status} - ${text}`);
      }

      logger.info(`${type} Webhook 通知发送成功`);
    } catch (error) {
      logger.error(`${type} Webhook 通知发送失败`, { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 构建 Slack 消息格式
   */
  private buildSlackPayload(payload: NotificationPayload): object {
    const passRatePercent = (payload.passRate * 100).toFixed(1);
    const statusColor = payload.passRate >= 0.8 ? 'good' : payload.passRate >= 0.5 ? 'warning' : 'danger';
    const statusEmoji = payload.passRate >= 0.8 ? ':white_check_mark:' : payload.passRate >= 0.5 ? ':warning:' : ':x:';

    return {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${statusEmoji} ${payload.project} 测试完成`,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*通过:* ${payload.passed}` },
            { type: 'mrkdwn', text: `*失败:* ${payload.failed}` },
            { type: 'mrkdwn', text: `*总数:* ${payload.total}` },
            { type: 'mrkdwn', text: `*通过率:* ${passRatePercent}%` },
          ],
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*平台:* ${payload.platform}` },
            { type: 'mrkdwn', text: `*耗时:* ${this.formatDuration(payload.duration)}` },
            { type: 'mrkdwn', text: `*风险:* ${payload.riskLevel.toUpperCase()}` },
            { type: 'mrkdwn', text: `*关键问题:* ${payload.criticalIssues}` },
          ],
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `测试时间: ${payload.startTime} | 运行 ID: ${payload.runId}` },
          ],
        },
        {
          type: 'actions',
          elements: payload.reportUrl
            ? [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '查看报告' },
                  url: payload.reportUrl,
                  style: 'primary',
                },
              ]
            : [],
        },
      ],
      attachments: [
        {
          color: statusColor,
          blocks: [],
        },
      ],
    };
  }

  /**
   * 构建飞书消息格式
   */
  private buildFeishuPayload(payload: NotificationPayload): object {
    const passRatePercent = (payload.passRate * 100).toFixed(1);
    const statusEmoji = payload.passRate >= 0.8 ? '✅' : payload.passRate >= 0.5 ? '⚠️' : '❌';

    return {
      msg_type: 'interactive',
      card: {
        config: { wide_screen_mode: true },
        header: {
          title: { tag: 'plain_text', content: `${statusEmoji} ${payload.project} 测试完成` },
          template: payload.passRate >= 0.8 ? 'blue' : payload.passRate >= 0.5 ? 'wathet' : 'red',
        },
        elements: [
          {
            tag: 'div',
            fields: [
              { is_short: true, text: { tag: 'lark_md', content: `**通过:** ${payload.passed}` } },
              { is_short: true, text: { tag: 'lark_md', content: `**失败:** ${payload.failed}` } },
              { is_short: true, text: { tag: 'lark_md', content: `**总数:** ${payload.total}` } },
              { is_short: true, text: { tag: 'lark_md', content: `**通过率:** ${passRatePercent}%` } },
            ],
          },
          {
            tag: 'div',
            fields: [
              { is_short: true, text: { tag: 'lark_md', content: `**平台:** ${payload.platform}` } },
              { is_short: true, text: { tag: 'lark_md', content: `**耗时:** ${this.formatDuration(payload.duration)}` } },
              { is_short: true, text: { tag: 'lark_md', content: `**风险:** ${payload.riskLevel.toUpperCase()}` } },
              { is_short: true, text: { tag: 'lark_md', content: `**关键问题:** ${payload.criticalIssues}` } },
            ],
          },
          {
            tag: 'note',
            elements: [{ tag: 'plain_text', content: `测试时间: ${payload.startTime} | 运行 ID: ${payload.runId}` }],
          },
          ...(payload.reportUrl
            ? [
                {
                  tag: 'action',
                  actions: [
                    {
                      tag: 'button',
                      text: { tag: 'plain_text', content: '查看报告' },
                      url: payload.reportUrl,
                      type: 'primary',
                    },
                  ],
                },
              ]
            : []),
        ],
      },
    };
  }

  /**
   * 构建企业微信消息格式
   */
  private buildWecomPayload(payload: NotificationPayload): object {
    const passRatePercent = (payload.passRate * 100).toFixed(1);
    const statusEmoji = payload.passRate >= 0.8 ? '✅' : payload.passRate >= 0.5 ? '⚠️' : '❌';

    const content = `${statusEmoji} ${payload.project} 测试完成
> 通过率: **${passRatePercent}%**
> 通过: ${payload.passed} | 失败: ${payload.failed} | 总数: ${payload.total}
> 平台: ${payload.platform} | 耗时: ${this.formatDuration(payload.duration)}
> 风险: ${payload.riskLevel.toUpperCase()} | 关键问题: ${payload.criticalIssues} 个
> 运行 ID: ${payload.runId}
${payload.reportUrl ? `[查看报告](<${payload.reportUrl}>)` : ''}`;

    return {
      msgtype: 'markdown',
      markdown: { content },
    };
  }

  /**
   * 构建钉钉消息格式
   */
  private buildDingtalkPayload(payload: NotificationPayload, secret?: string): object {
    const passRatePercent = (payload.passRate * 100).toFixed(1);
    const statusEmoji = payload.passRate >= 0.8 ? '✅' : payload.passRate >= 0.5 ? '⚠️' : '❌';

    const textContent = `${statusEmoji} ${payload.project} 测试完成
- 通过率: ${passRatePercent}%
- 通过: ${payload.passed} | 失败: ${payload.failed} | 总数: ${payload.total}
- 平台: ${payload.platform} | 耗时: ${this.formatDuration(payload.duration)}
- 风险: ${payload.riskLevel.toUpperCase()} | 关键问题: ${payload.criticalIssues} 个
- 运行 ID: ${payload.runId}
${payload.reportUrl ? `查看报告: ${payload.reportUrl}` : ''}`;

    const body: object = {
      msgtype: 'text',
      text: { content: textContent },
    };

    // 如果有密钥，添加签名
    if (secret) {
      const timestamp = Date.now();
      const sign = this.generateDingtalkSign(timestamp, secret);
      return {
        ...body,
        timestamp,
        sign,
      };
    }

    return body;
  }

  /**
   * 生成钉钉签名
   */
  private generateDingtalkSign(timestamp: number, secret: string): string {
    const stringToSign = timestamp + '\n' + secret;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(stringToSign);
    return hmac.digest('base64');
  }

  /**
   * 获取风险等级 emoji
   */
  private getRiskEmoji(level: string): string {
    switch (level) {
      case 'low':
        return '🟢';
      case 'medium':
        return '🟡';
      case 'high':
        return '🟠';
      case 'critical':
        return '🔴';
      default:
        return '⚪';
    }
  }

  /**
   * 格式化持续时间
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  /**
   * 关闭通知器（释放资源）
   */
  async close(): Promise<void> {
    if (this.emailTransporter) {
      try {
        this.emailTransporter.close();
      } catch (error) {
        logger.warn('关闭邮件传输器失败', { error: String(error) });
      }
      this.emailTransporter = null;
    }
  }
}

/**
 * 快捷函数：发送测试完成通知
 */
export async function sendTestNotification(
  result: TestRunResult,
  config: NotificationConfig,
  reportUrl?: string,
): Promise<void> {
  const notifier = new Notifier(config);
  try {
    await notifier.sendAll(result, reportUrl);
  } finally {
    await notifier.close();
  }
}

/**
 * 快捷函数：创建通知器
 */
export function createNotifier(config: NotificationConfig): Notifier {
  return new Notifier(config);
}
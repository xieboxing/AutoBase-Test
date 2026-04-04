/**
 * 浏览器实例管理器
 * 统一管理所有浏览器实例，确保正确关闭
 */

import type { Browser, BrowserContext, Page } from 'playwright';
import { logger } from '@/core/logger.js';

/**
 * 浏览器实例记录
 */
interface BrowserInstance {
  browser: Browser;
  contexts: BrowserContext[];
  createdAt: Date;
  id: string;
}

/**
 * 全局浏览器实例存储
 */
const browserInstances: Map<string, BrowserInstance> = new Map();
let instanceCounter = 0;

/**
 * 注册浏览器实例
 */
export function registerBrowser(browser: Browser): string {
  const id = `browser-${++instanceCounter}`;
  browserInstances.set(id, {
    id,
    browser,
    contexts: [],
    createdAt: new Date(),
  });

  logger.debug(`浏览器实例已注册: ${id}`);
  return id;
}

/**
 * 注册浏览器上下文
 */
export function registerContext(browserId: string, context: BrowserContext): void {
  const instance = browserInstances.get(browserId);
  if (instance) {
    instance.contexts.push(context);
    logger.debug(`浏览器上下文已注册: ${browserId}`);
  }
}

/**
 * 获取所有浏览器实例
 */
export function getBrowserInstances(): BrowserInstance[] {
  return Array.from(browserInstances.values());
}

/**
 * 关闭单个浏览器实例（带超时保护）
 */
export async function closeBrowser(id: string, timeoutMs: number = 180000): Promise<void> {
  const instance = browserInstances.get(id);
  if (!instance) {
    return;
  }

  try {
    // 先关闭所有上下文（带超时）
    for (const context of instance.contexts) {
      try {
        const closePromise = context.close();
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('关闭上下文超时')), timeoutMs / 2);
        });
        await Promise.race([closePromise, timeoutPromise]);
      } catch (error) {
        logger.warn(`关闭浏览器上下文失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 再关闭浏览器（带超时）
    try {
      const browserClosePromise = instance.browser.close();
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('关闭浏览器超时')), timeoutMs / 2);
      });
      await Promise.race([browserClosePromise, timeoutPromise]);
    } catch (error) {
      logger.warn(`关闭浏览器失败: ${error instanceof Error ? error.message : String(error)}`);
    }

    browserInstances.delete(id);
    logger.debug(`浏览器实例已关闭: ${id}`);
  } catch (error) {
    logger.error(`关闭浏览器实例异常: ${id}`, { error: String(error) });
    // 确保从 Map 中删除，避免内存泄漏
    browserInstances.delete(id);
  }
}

/**
 * 关闭所有浏览器实例
 */
export async function closeAllBrowsers(): Promise<number> {
  const ids = Array.from(browserInstances.keys());
  let closedCount = 0;

  for (const id of ids) {
    try {
      await closeBrowser(id);
      closedCount++;
    } catch (error) {
      logger.error(`关闭浏览器实例失败: ${id}`, { error: String(error) });
    }
  }

  if (closedCount > 0) {
    logger.info(`已关闭 ${closedCount} 个浏览器实例`);
  }

  return closedCount;
}

/**
 * 获取页面数量
 */
export function getPageCount(): number {
  let count = 0;
  for (const instance of browserInstances.values()) {
    for (const context of instance.contexts) {
      count += context.pages().length;
    }
  }
  return count;
}

/**
 * 检查是否有活动的浏览器实例
 */
export function hasActiveBrowsers(): boolean {
  return browserInstances.size > 0;
}
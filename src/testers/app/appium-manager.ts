/**
 * Appium 会话管理器
 * 统一管理所有 Appium 会话，确保正确关闭
 */

import type { Browser as WebdriverIOBrowser } from 'webdriverio';
import { logger } from '@/core/logger.js';

/**
 * Appium 会话记录
 */
interface AppiumSession {
  driver: WebdriverIOBrowser;
  deviceId: string;
  packageName: string;
  createdAt: Date;
  id: string;
}

/**
 * 全局 Appium 会话存储
 */
const appiumSessions: Map<string, AppiumSession> = new Map();
let sessionCounter = 0;

/**
 * 注册 Appium 会话
 */
export function registerAppiumSession(
  driver: WebdriverIOBrowser,
  deviceId: string,
  packageName: string,
): string {
  const id = `appium-${++sessionCounter}`;
  appiumSessions.set(id, {
    id,
    driver,
    deviceId,
    packageName,
    createdAt: new Date(),
  });

  logger.debug(`Appium 会话已注册: ${id} (设备: ${deviceId}, 包: ${packageName})`);
  return id;
}

/**
 * 获取所有 Appium 会话
 */
export function getAppiumSessions(): AppiumSession[] {
  return Array.from(appiumSessions.values());
}

/**
 * 关闭单个 Appium 会话（带超时保护）
 */
export async function closeAppiumSession(id: string, timeoutMs: number = 180000): Promise<void> {
  const session = appiumSessions.get(id);
  if (!session) {
    return;
  }

  try {
    // 添加超时保护，防止 deleteSession 卡住
    const closePromise = session.driver.deleteSession();
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error(`关闭 Appium 会话超时 (${timeoutMs}ms)`)), timeoutMs);
    });

    await Promise.race([closePromise, timeoutPromise]);
    appiumSessions.delete(id);
    logger.debug(`Appium 会话已关闭: ${id}`);
  } catch (error) {
    logger.warn(`关闭 Appium 会话失败: ${id}`, { error: String(error) });
    // 即使失败也删除记录，避免内存泄漏
    appiumSessions.delete(id);
  }
}

/**
 * 关闭所有 Appium 会话
 */
export async function closeAllAppiumSessions(): Promise<number> {
  const ids = Array.from(appiumSessions.keys());
  let closedCount = 0;

  for (const id of ids) {
    try {
      await closeAppiumSession(id);
      closedCount++;
    } catch (error) {
      logger.error(`关闭 Appium 会话失败: ${id}`, { error: String(error) });
    }
  }

  if (closedCount > 0) {
    logger.info(`已关闭 ${closedCount} 个 Appium 会话`);
  }

  return closedCount;
}

/**
 * 获取指定设备的会话
 */
export function getSessionByDevice(deviceId: string): AppiumSession | undefined {
  for (const session of appiumSessions.values()) {
    if (session.deviceId === deviceId) {
      return session;
    }
  }
  return undefined;
}

/**
 * 检查是否有活动的 Appium 会话
 */
export function hasActiveSessions(): boolean {
  return appiumSessions.size > 0;
}
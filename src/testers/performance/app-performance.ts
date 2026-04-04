import { logger } from '@/core/logger.js';
import { eventBus } from '@/core/event-bus.js';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { PerformanceResult } from '@/types/test-result.types.js';

/**
 * APP 性能测试器配置
 */
export interface AppPerformanceConfig {
  packageName: string;
  device?: string;             // 设备 ID（可选，默认取第一个）
  adbPath?: string;            // ADB 路径（默认 'adb'）
  duration: number;            // 采集持续时间（秒）
  interval: number;            // 采集间隔（毫秒）
  artifactsDir: string;
}

/**
 * 性能数据点
 */
export interface PerformanceDataPoint {
  timestamp: number;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  fps?: FpsMetrics;
  network?: NetworkMetrics;
  battery?: BatteryMetrics;
}

/**
 * CPU 指标
 */
export interface CpuMetrics {
  user: number;          // 用户空间 CPU 使用率 (%)
  system: number;        // 内核空间 CPU 使用率 (%)
  total: number;         // 总 CPU 使用率 (%)
  cores: number;         // CPU 核心数
}

/**
 * 内存指标
 */
export interface MemoryMetrics {
  total: number;         // 总内存 (KB)
  used: number;          // 已使用内存 (KB)
  free: number;          // 空闲内存 (KB)
  app: number;           // APP 占用内存 (KB)
  native: number;        // Native 堆内存 (KB)
  dalvik: number;        // Dalvik 堆内存 (KB)
}

/**
 * FPS 指标
 */
export interface FpsMetrics {
  fps: number;           // 当前帧率
  droppedFrames: number; // 丢帧数
  jankyFrames: number;   // 卡顿帧数
}

/**
 * 网络指标
 */
export interface NetworkMetrics {
  rxBytes: number;       // 接收字节数
  txBytes: number;       // 发送字节数
  rxPackets: number;     // 接收包数
  txPackets: number;     // 发送包数
}

/**
 * 电池指标
 */
export interface BatteryMetrics {
  level: number;         // 电量百分比
  temperature: number;   // 温度 (°C)
  voltage: number;       // 电压 (mV)
  current: number;       // 电流 (mA)
  power: number;         // 功率 (mW)
}

/**
 * 性能测试结果
 */
export interface AppPerformanceResult {
  runId: string;
  packageName: string;
  device: string;
  duration: number;
  dataPoints: PerformanceDataPoint[];
  summary: AppPerformanceSummary;
  startTime: string;
  endTime: string;
}

/**
 * 性能测试汇总
 */
export interface AppPerformanceSummary {
  cpu: {
    avgTotal: number;
    maxTotal: number;
    minTotal: number;
    avgUser: number;
    avgSystem: number;
  };
  memory: {
    avgApp: number;
    maxApp: number;
    minApp: number;
    avgUsed: number;
    peakMemory: number;
  };
  fps?: {
    avgFps: number;
    minFps: number;
    droppedFramesTotal: number;
    jankyFramesTotal: number;
  };
  network?: {
    totalRxBytes: number;
    totalTxBytes: number;
    avgRxRate: number;     // KB/s
    avgTxRate: number;     // KB/s
  };
  battery?: {
    startLevel: number;
    endLevel: number;
    drainRate: number;     // %/hour
    avgTemperature: number;
    avgPower: number;      // mW
  };
}

/**
 * 默认配置
 */
const DEFAULT_APP_PERFORMANCE_CONFIG: AppPerformanceConfig = {
  packageName: '',
  duration: 60,          // 默认采集 60 秒
  interval: 1000,         // 每秒采集一次
  artifactsDir: './data/performance',
};

/**
 * APP 性能测试器
 */
export class AppPerformanceTester {
  protected config: AppPerformanceConfig;
  protected dataPoints: PerformanceDataPoint[] = [];
  protected adbPath: string;
  protected device: string = '';

  constructor(config: Partial<AppPerformanceConfig> & { packageName: string }) {
    this.config = { ...DEFAULT_APP_PERFORMANCE_CONFIG, ...config };
    this.adbPath = config.adbPath || 'adb';
  }

  /**
   * 运行性能测试
   */
  async run(): Promise<PerformanceResult> {
    const runId = nanoid(8);
    const startTime = new Date();

    // 验证必需配置
    if (!this.config.packageName) {
      throw new Error('packageName 是必需的配置项');
    }

    logger.info('🚀 开始 APP 性能测试', { packageName: this.config.packageName, runId });
    eventBus.emit('test:start', { caseId: runId, name: 'app-performance' });

    // 确保目录存在
    await fs.mkdir(this.config.artifactsDir, { recursive: true });

    // 获取设备
    this.device = await this.getDevice();
    logger.step(`📱 使用设备: ${this.device}`);

    // 开始采集数据
    await this.collectPerformanceData();

    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    eventBus.emit('test:complete', { caseId: runId, status: 'passed' });
    logger.info('📊 APP 性能测试完成', { durationMs, dataPoints: this.dataPoints.length });

    // 保存结果
    const result = this.generateResult(startTime, endTime);
    await this.saveResult(result);

    return this.generatePerformanceResult(result);
  }

  /**
   * 获取设备 ID
   */
  protected async getDevice(): Promise<string> {
    if (this.config.device) {
      return this.config.device;
    }

    try {
      const devices = await this.runAdbCommand(['devices']);
      const lines = devices.split('\n').filter(line => line.includes('\t'));
      if (lines.length === 0) {
        throw new Error('没有找到连接的设备');
      }
      // 解析设备 ID（格式："<device_id>\t<status>"）
      const firstLine = lines[0];
      if (!firstLine) {
        throw new Error('无法解析设备列表：设备行为空');
      }
      const parts = firstLine.split('\t');
      const deviceId = parts[0];
      if (!deviceId || deviceId.trim() === '') {
        throw new Error(`无法解析设备 ID：设备行格式无效 "${firstLine}"`);
      }
      return deviceId.trim();
    } catch (error) {
      throw new Error(`获取设备失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 采集性能数据
   */
  protected async collectPerformanceData(): Promise<void> {
    const iterations = Math.ceil((this.config.duration * 1000) / this.config.interval);
    let previousNetwork: NetworkMetrics | undefined;

    for (let i = 0; i < iterations; i++) {
      const timestamp = Date.now();

      try {
        // 并行采集所有指标
        const [cpu, memory, fps, network, battery] = await Promise.all([
          this.collectCpuMetrics(),
          this.collectMemoryMetrics(),
          this.collectFpsMetrics().catch(() => undefined),
          this.collectNetworkMetrics().catch(() => undefined),
          this.collectBatteryMetrics().catch(() => undefined),
        ]);

        const dataPoint: PerformanceDataPoint = {
          timestamp,
          cpu,
          memory,
          fps,
          network,
          battery,
        };

        this.dataPoints.push(dataPoint);

        // 计算网络速率（需要前一次数据）
        if (network && previousNetwork) {
          // const timeDiff = this.config.interval / 1000; // 秒
          network.rxBytes = Math.max(0, network.rxBytes - previousNetwork.rxBytes);
          network.txBytes = Math.max(0, network.txBytes - previousNetwork.txBytes);
        }
        previousNetwork = network;

        logger.perf(`📊 采集数据点 ${i + 1}/${iterations}`, {
          cpu: `${cpu.total.toFixed(1)}%`,
          memory: `${(memory.app / 1024).toFixed(1)}MB`,
          fps: fps ? `${fps.fps}` : 'N/A',
        });

        // 等待下一次采集
        if (i < iterations - 1) {
          await this.sleep(this.config.interval);
        }
      } catch (error) {
        logger.warn(`⚠️ 采集数据失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * 采集 CPU 指标
   */
  protected async collectCpuMetrics(): Promise<CpuMetrics> {
    try {
      // 使用 dumpsys cpuinfo
      const output = await this.runAdbCommand([
        '-s', this.device!,
        'shell', 'dumpsys', 'cpuinfo', '|', 'grep', this.config.packageName!,
      ]);

      // 解析输出
      const match = output.match(/(\d+(?:\.\d+)?)%.*?(\d+(?:\.\d+)?)%.*?(\d+(?:\.\d+)?)%/);
      if (match?.[1] && match?.[2] && match?.[3]) {
        return {
          user: parseFloat(match[1]),
          system: parseFloat(match[2]),
          total: parseFloat(match[3]),
          cores: await this.getCpuCores(),
        };
      }

      // 备用方案：从 /proc/stat 读取
      const statOutput = await this.runAdbCommand([
        '-s', this.device!,
        'shell', `cat /proc/${await this.getPid()}/stat`,
      ]);

      return this.parseProcStat(statOutput);
    } catch {
      return {
        user: 0,
        system: 0,
        total: 0,
        cores: 4,
      };
    }
  }

  /**
   * 采集内存指标
   */
  protected async collectMemoryMetrics(): Promise<MemoryMetrics> {
    try {
      const output = await this.runAdbCommand([
        '-s', this.device,
        'shell', 'dumpsys', 'meminfo', this.config.packageName!,
      ]);

      return this.parseMeminfo(output);
    } catch {
      return {
        total: 0,
        used: 0,
        free: 0,
        app: 0,
        native: 0,
        dalvik: 0,
      };
    }
  }

  /**
   * 采集 FPS 指标
   */
  protected async collectFpsMetrics(): Promise<FpsMetrics | undefined> {
    try {
      // 使用 dumpsys gfxinfo
      const output = await this.runAdbCommand([
        '-s', this.device,
        'shell', 'dumpsys', 'gfxinfo', this.config.packageName!,
      ]);

      return this.parseGfxinfo(output);
    } catch {
      return undefined;
    }
  }

  /**
   * 采集网络指标
   */
  protected async collectNetworkMetrics(): Promise<NetworkMetrics | undefined> {
    try {
      const output = await this.runAdbCommand([
        '-s', this.device,
        'shell', 'cat', `/proc/${await this.getPid()}/net/dev`,
      ]);

      return this.parseNetDev(output);
    } catch {
      return undefined;
    }
  }

  /**
   * 采集电池指标
   */
  protected async collectBatteryMetrics(): Promise<BatteryMetrics | undefined> {
    try {
      const output = await this.runAdbCommand([
        '-s', this.device,
        'shell', 'dumpsys', 'batterystats',
      ]);

      return this.parseBatterystats(output);
    } catch {
      return undefined;
    }
  }

  /**
   * 获取 PID
   */
  protected async getPid(): Promise<number> {
    const output = await this.runAdbCommand([
      '-s', this.device,
      'shell', `pidof ${this.config.packageName!}`,
    ]);
    return parseInt(output.trim(), 10);
  }

  /**
   * 获取 CPU 核心数
   */
  protected async getCpuCores(): Promise<number> {
    try {
      const output = await this.runAdbCommand([
        '-s', this.device,
        'shell', 'cat', '/proc/cpuinfo',
      ]);
      const cores = (output.match(/processor/g) || []).length;
      return cores || 4;
    } catch {
      return 4;
    }
  }

  /**
   * 解析 /proc/stat 输出
   */
  protected parseProcStat(output: string): CpuMetrics {
    // 简化解析，实际需要更复杂的计算
    const parts = output.trim().split(/\s+/);
    if (parts.length >= 5) {
      const user = Number(parts[1]) || 0;
      const system = Number(parts[3]) || 0;
      const total = user + system;
      return {
        user: user / 100,
        system: system / 100,
        total: total / 100,
        cores: 4,
      };
    }
    return { user: 0, system: 0, total: 0, cores: 4 };
  }

  /**
   * 解析 meminfo 输出
   */
  protected parseMeminfo(output: string): MemoryMetrics {
    const result: MemoryMetrics = {
      total: 0,
      used: 0,
      free: 0,
      app: 0,
      native: 0,
      dalvik: 0,
    };

    // 解析总内存
    const totalMatch = output.match(/Total RAM:\s*(\d+)/);
    if (totalMatch?.[1]) {
      result.total = parseInt(totalMatch[1], 10);
    }

    // 解析空闲内存
    const freeMatch = output.match(/Free RAM:\s*(\d+)/);
    if (freeMatch?.[1]) {
      result.free = parseInt(freeMatch[1], 10);
    }

    // 解析 APP 内存
    const appMatch = output.match(/TOTAL\s+(\d+)/);
    if (appMatch?.[1]) {
      result.app = parseInt(appMatch[1], 10);
    }

    // 解析 Native 堆
    const nativeMatch = output.match(/Native Heap\s+(\d+)/);
    if (nativeMatch?.[1]) {
      result.native = parseInt(nativeMatch[1], 10);
    }

    // 解析 Dalvik 堆
    const dalvikMatch = output.match(/Dalvik Heap\s+(\d+)/);
    if (dalvikMatch?.[1]) {
      result.dalvik = parseInt(dalvikMatch[1], 10);
    }

    result.used = result.total - result.free;

    return result;
  }

  /**
   * 解析 gfxinfo 输出
   */
  protected parseGfxinfo(output: string): FpsMetrics {
    // 查找最近的帧数据
    const lines = output.split('\n');
    let totalFrames = 0;
    let jankyFrames = 0;

    for (const line of lines) {
      if (line.includes('Total frames rendered')) {
        const match = line.match(/(\d+)/);
        if (match?.[1]) totalFrames = parseInt(match[1], 10);
      }
      if (line.includes('Janky frames')) {
        const match = line.match(/(\d+)/);
        if (match?.[1]) jankyFrames = parseInt(match[1], 10);
      }
    }

    // 计算 FPS（简化）
    const fps = totalFrames > 0 ? Math.min(60, totalFrames) : 60;

    return {
      fps,
      droppedFrames: 0,
      jankyFrames,
    };
  }

  /**
   * 解析 /proc/net/dev 输出
   */
  protected parseNetDev(output: string): NetworkMetrics {
    const lines = output.split('\n');
    let rxBytes = 0;
    let txBytes = 0;
    let rxPackets = 0;
    let txPackets = 0;

    for (const line of lines) {
      if (line.includes('wlan') || line.includes('rmnet')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 10) {
          rxBytes += Number(parts[1]) || 0;
          rxPackets += Number(parts[2]) || 0;
          txBytes += Number(parts[9]) || 0;
          txPackets += Number(parts[10]) || 0;
        }
      }
    }

    return { rxBytes, txBytes, rxPackets, txPackets };
  }

  /**
   * 解析 batterystats 输出
   */
  protected parseBatterystats(output: string): BatteryMetrics {
    let level = 100;
    let temperature = 25;
    let voltage = 4000;
    const current = 0;
    const power = 0;

    const levelMatch = output.match(/level:\s*(\d+)/);
    if (levelMatch?.[1]) level = parseInt(levelMatch[1], 10);

    const tempMatch = output.match(/temperature:\s*(\d+)/);
    if (tempMatch?.[1]) temperature = parseInt(tempMatch[1], 10) / 10;

    const voltageMatch = output.match(/voltage:\s*(\d+)/);
    if (voltageMatch?.[1]) voltage = parseInt(voltageMatch[1], 10);

    return {
      level,
      temperature,
      voltage,
      current,
      power,
    };
  }

  /**
   * 运行 ADB 命令
   */
  protected async runAdbCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.adbPath, args, { shell: true });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', data => {
        stdout += data.toString();
      });

      proc.stderr.on('data', data => {
        stderr += data.toString();
      });

      proc.on('close', code => {
        if (code === 0) {
          resolve(stdout);
        } else {
          const errorMsg = stderr || stdout || `ADB command exited with code ${code}`;
          reject(new Error(`ADB command failed: ${errorMsg}`));
        }
      });

      proc.on('error', err => {
        reject(new Error(`ADB command error: ${err.message}`));
      });

      // 设置超时
      setTimeout(() => {
        try {
          proc.kill();
        } catch {
          // 忽略终止错误
        }
        reject(new Error('ADB command timeout'));
      }, 30000);
    });
  }

  /**
   * 生成结果
   */
  protected generateResult(startTime: Date, endTime: Date): AppPerformanceResult {
    return {
      runId: nanoid(8),
      packageName: this.config.packageName!,
      device: this.device!,
      duration: this.config.duration,
      dataPoints: this.dataPoints,
      summary: this.calculateSummary(),
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    };
  }

  /**
   * 计算汇总数据
   */
  protected calculateSummary(): AppPerformanceSummary {
    const cpuTotals = this.dataPoints.map(d => d.cpu.total);
    const cpuUsers = this.dataPoints.map(d => d.cpu.user);
    const cpuSystems = this.dataPoints.map(d => d.cpu.system);

    const appMemories = this.dataPoints.map(d => d.memory.app);
    const usedMemories = this.dataPoints.map(d => d.memory.used);

    const summary: AppPerformanceSummary = {
      cpu: {
        avgTotal: this.average(cpuTotals),
        maxTotal: Math.max(...cpuTotals),
        minTotal: Math.min(...cpuTotals),
        avgUser: this.average(cpuUsers),
        avgSystem: this.average(cpuSystems),
      },
      memory: {
        avgApp: this.average(appMemories),
        maxApp: Math.max(...appMemories),
        minApp: Math.min(...appMemories),
        avgUsed: this.average(usedMemories),
        peakMemory: Math.max(...appMemories),
      },
    };

    // FPS 汇总
    if (this.dataPoints[0]?.fps) {
      const fpsValues = this.dataPoints.filter(d => d.fps).map(d => d.fps!.fps);
      const droppedTotal = this.dataPoints.filter(d => d.fps).reduce((sum, d) => sum + (d.fps?.droppedFrames || 0), 0);
      const jankyTotal = this.dataPoints.filter(d => d.fps).reduce((sum, d) => sum + (d.fps?.jankyFrames || 0), 0);

      summary.fps = {
        avgFps: this.average(fpsValues),
        minFps: Math.min(...fpsValues),
        droppedFramesTotal: droppedTotal,
        jankyFramesTotal: jankyTotal,
      };
    }

    // 网络汇总
    if (this.dataPoints[0]?.network) {
      const firstNetwork = this.dataPoints[0].network;
      const lastDataPoint = this.dataPoints[this.dataPoints.length - 1];
      const lastNetwork = lastDataPoint?.network;

      if (firstNetwork && lastNetwork) {
        const rxTotal = lastNetwork.rxBytes - firstNetwork.rxBytes;
        const txTotal = lastNetwork.txBytes - firstNetwork.txBytes;
        const durationSec = this.config.duration;

        summary.network = {
          totalRxBytes: rxTotal,
          totalTxBytes: txTotal,
          avgRxRate: (rxTotal / 1024) / durationSec,
          avgTxRate: (txTotal / 1024) / durationSec,
        };
      }
    }

    // 电池汇总
    if (this.dataPoints[0]?.battery && this.dataPoints.length > 1) {
      const firstBattery = this.dataPoints[0].battery!;
      const lastDataPoint = this.dataPoints[this.dataPoints.length - 1];
      const lastBattery = lastDataPoint?.battery;

      if (lastBattery) {
        const levelDiff = firstBattery.level - lastBattery.level;
        const durationHours = this.config.duration / 3600;
        const temperatures = this.dataPoints.filter(d => d.battery).map(d => d.battery!.temperature);
        const powers = this.dataPoints.filter(d => d.battery).map(d => d.battery!.power);

        summary.battery = {
          startLevel: firstBattery.level,
          endLevel: lastBattery.level,
          drainRate: durationHours > 0 ? levelDiff / durationHours : 0,
          avgTemperature: this.average(temperatures),
          avgPower: this.average(powers),
        };
      }
    }

    return summary;
  }

  /**
   * 计算平均值
   */
  protected average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * 保存结果到文件
   */
  protected async saveResult(result: AppPerformanceResult): Promise<void> {
    const filename = `app-perf-${result.runId}.json`;
    const filepath = path.join(this.config.artifactsDir, filename);
    await fs.writeFile(filepath, JSON.stringify(result, null, 2));
    logger.info(`💾 性能数据已保存: ${filepath}`);
  }

  /**
   * 生成 PerformanceResult
   */
  protected generatePerformanceResult(result: AppPerformanceResult): PerformanceResult {
    const summary = result.summary;

    return {
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      blocked: 0,
      passRate: 1,
      avgDurationMs: result.duration * 1000,
      metrics: {
        performanceScore: 100 - Math.round(summary.cpu.avgTotal),
        lcp: 0,
        fcp: 0,
        cls: 0,
        tbt: Math.round(summary.cpu.avgTotal * 10),
        speedIndex: summary.fps?.avgFps ? Math.round(1000 / summary.fps.avgFps * 100) : 0,
        tti: 0,
      },
    };
  }

  /**
   * 获取详细结果
   */
  getDetailedResults(): PerformanceDataPoint[] {
    return this.dataPoints;
  }

  /**
   * 获取汇总报告
   */
  getSummary(): string {
    if (this.dataPoints.length === 0) {
      return '暂无性能数据';
    }

    const summary = this.calculateSummary();
    const lines: string[] = [
      `# APP 性能测试报告`,
      ``,
      `## 基本信息`,
      `- 包名: ${this.config.packageName!}`,
      `- 设备: ${this.device}`,
      `- 测试时长: ${this.config.duration}s`,
      `- 采样点数: ${this.dataPoints.length}`,
      ``,
      `## CPU 性能`,
      `- 平均使用率: ${summary.cpu.avgTotal.toFixed(1)}%`,
      `- 最大使用率: ${summary.cpu.maxTotal.toFixed(1)}%`,
      `- 最小使用率: ${summary.cpu.minTotal.toFixed(1)}%`,
      `- 用户空间: ${summary.cpu.avgUser.toFixed(1)}%`,
      `- 内核空间: ${summary.cpu.avgSystem.toFixed(1)}%`,
      ``,
      `## 内存性能`,
      `- 平均占用: ${(summary.memory.avgApp / 1024).toFixed(1)}MB`,
      `- 最大占用: ${(summary.memory.maxApp / 1024).toFixed(1)}MB`,
      `- 最小占用: ${(summary.memory.minApp / 1024).toFixed(1)}MB`,
    ];

    if (summary.fps) {
      lines.push(``);
      lines.push(`## 帧率性能`);
      lines.push(`- 平均帧率: ${summary.fps.avgFps.toFixed(1)}FPS`);
      lines.push(`- 最低帧率: ${summary.fps.minFps.toFixed(1)}FPS`);
      lines.push(`- 卡顿帧数: ${summary.fps.jankyFramesTotal}`);
    }

    if (summary.network) {
      lines.push(``);
      lines.push(`## 网络性能`);
      lines.push(`- 总接收: ${(summary.network.totalRxBytes / 1024).toFixed(1)}KB`);
      lines.push(`- 总发送: ${(summary.network.totalTxBytes / 1024).toFixed(1)}KB`);
      lines.push(`- 平均下载速率: ${summary.network.avgRxRate.toFixed(2)}KB/s`);
      lines.push(`- 平均上传速率: ${summary.network.avgTxRate.toFixed(2)}KB/s`);
    }

    if (summary.battery) {
      lines.push(``);
      lines.push(`## 电池性能`);
      lines.push(`- 起始电量: ${summary.battery.startLevel}%`);
      lines.push(`- 结束电量: ${summary.battery.endLevel}%`);
      lines.push(`- 耗电速率: ${summary.battery.drainRate.toFixed(2)}%/h`);
      lines.push(`- 平均温度: ${summary.battery.avgTemperature.toFixed(1)}°C`);
    }

    return lines.join('\n');
  }

  /**
   * 休眠
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 快捷执行函数
 */
export async function runAppPerformanceTest(
  packageName: string,
  config?: Partial<AppPerformanceConfig>,
): Promise<PerformanceResult> {
  const tester = new AppPerformanceTester({ packageName, ...config });
  return tester.run();
}

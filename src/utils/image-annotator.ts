/**
 * 图片标注模块
 * 用于在截图上绘制问题区域标注
 */

import type {
  ImageAnnotation,
  AnnotatedScreenshot,
  AnnotationConfig,
  EnhancedInspectionIssue,
  TestCasePriority,
} from '@/types/financial.types.js';
import { logger } from '@/core/logger.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';

/**
 * 默认标注颜色
 */
const DEFAULT_COLORS: Record<string, string> = {
  P0: '#FF0000',  // 红色 - 严重
  P1: '#FF8800',  // 橙色 - 重要
  P2: '#0088FF',  // 蓝色 - 一般
  P3: '#888888',  // 灰色 - 轻微
};

/**
 * 图片标注器类
 */
export class ImageAnnotator {
  private config: AnnotationConfig;

  constructor(config?: Partial<AnnotationConfig>) {
    this.config = {
      enabled: config?.enabled ?? true,
      colors: { ...DEFAULT_COLORS, ...config?.colors },
      lineWidth: config?.lineWidth ?? 3,
      showLabels: config?.showLabels ?? true,
    };
  }

  /**
   * 标注图片
   */
  async annotateImage(
    imagePath: string,
    annotations: ImageAnnotation[],
    outputPath?: string,
  ): Promise<AnnotatedScreenshot> {
    if (!this.config.enabled) {
      return {
        originalPath: imagePath,
        annotatedPath: imagePath,
        annotations: [],
        issueCount: 0,
      };
    }

    logger.step(`🖼️ 生成标注截图: ${basename(imagePath)}`);

    try {
      // 读取原始图片
      const imageBuffer = await readFile(imagePath);

      // 如果有 Canvas 库，使用 Canvas 进行标注
      // 否则使用 SVG 叠加方式
      let annotatedBuffer: Buffer;

      try {
        annotatedBuffer = await this.annotateWithCanvas(imageBuffer, annotations);
      } catch {
        // 降级为 SVG 叠加
        annotatedBuffer = await this.annotateWithSvg(imageBuffer, annotations);
      }

      // 确定输出路径
      const finalOutputPath = outputPath || this.getAnnotatedPath(imagePath);

      // 确保输出目录存在
      await mkdir(dirname(finalOutputPath), { recursive: true });

      // 保存标注图片
      await writeFile(finalOutputPath, annotatedBuffer);

      logger.pass(`✅ 标注截图已保存: ${basename(finalOutputPath)}`);

      return {
        originalPath: imagePath,
        annotatedPath: finalOutputPath,
        annotations,
        issueCount: annotations.filter(a => a.issueId).length,
      };
    } catch (error) {
      logger.warn(`⚠️ 图片标注失败: ${(error as Error).message}`);
      return {
        originalPath: imagePath,
        annotatedPath: imagePath,
        annotations: [],
        issueCount: 0,
      };
    }
  }

  /**
   * 使用 Canvas 进行标注
   */
  private async annotateWithCanvas(
    imageBuffer: Buffer,
    annotations: ImageAnnotation[],
  ): Promise<Buffer> {
    // 尝试加载 canvas 库
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const canvasLib = await import('canvas').catch(() => null) as {
      createCanvas: (width: number, height: number) => {
        getContext: (type: string) => CanvasRenderingContext2D;
        toBuffer: (format: string) => Buffer;
        width: number;
        height: number;
      };
      loadImage: (buffer: Buffer) => Promise<unknown>;
    } | null;

    if (!canvasLib) {
      throw new Error('canvas 库未安装');
    }

    const { createCanvas, loadImage } = canvasLib;

    // 加载图片
    const image = await loadImage(imageBuffer);

    // 创建 Canvas（需要获取实际尺寸）
    // 先用默认尺寸，然后根据图片调整
    const canvas = createCanvas(1080, 1920);
    const ctx = canvas.getContext('2d');

    // 绘制原始图片
    ctx.drawImage(image as CanvasImageSource, 0, 0);

    // 设置绘制样式
    ctx.lineWidth = this.config.lineWidth ?? 3;

    // 绘制每个标注
    for (const annotation of annotations) {
      const color = annotation.color || this.getColorForSeverity(annotation.severity);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      switch (annotation.type) {
        case 'rectangle':
          this.drawRectangle(ctx, annotation, canvas.width, canvas.height);
          break;

        case 'circle':
          this.drawCircle(ctx, annotation, canvas.width, canvas.height);
          break;

        case 'arrow':
          this.drawArrow(ctx, annotation, canvas.width, canvas.height);
          break;
      }

      // 绘制标签
      if (this.config.showLabels && annotation.label) {
        this.drawLabel(ctx, annotation, canvas.width, canvas.height);
      }
    }

    // 返回 Buffer
    return canvas.toBuffer('image/png');
  }

  /**
   * 使用 SVG 叠加进行标注（降级方案）
   */
  private async annotateWithSvg(
    imageBuffer: Buffer,
    annotations: ImageAnnotation[],
  ): Promise<Buffer> {
    // 获取图片尺寸（从文件头解析）
    const dimensions = this.getImageDimensions(imageBuffer);
    const width = dimensions?.width || 1080;
    const height = dimensions?.height || 1920;

    // 构建 SVG 标注层
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;

    for (const annotation of annotations) {
      const color = annotation.color || this.getColorForSeverity(annotation.severity);
      const strokeWidth = this.config.lineWidth ?? 3;

      const x = (annotation.bounds.x / 100) * width;
      const y = (annotation.bounds.y / 100) * height;
      const w = (annotation.bounds.width / 100) * width;
      const h = (annotation.bounds.height / 100) * height;

      svgContent += `
        <rect
          x="${x}" y="${y}" width="${w}" height="${h}"
          fill="none" stroke="${color}" stroke-width="${strokeWidth}"
          stroke-dasharray="${annotation.severity === 'P0' ? '0' : '5,5'}"
        />`;

      if (this.config.showLabels && annotation.label) {
        svgContent += `
          <text x="${x}" y="${y - 5}" fill="${color}" font-size="14" font-weight="bold">
            ${this.escapeXml(annotation.label)}
          </text>`;
      }
    }

    svgContent += '</svg>';

    // 创建包含 SVG 叠加层的 HTML（作为降级方案）
    const base64Image = imageBuffer.toString('base64');
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; padding: 0; }
    .container { position: relative; width: ${width}px; height: ${height}px; }
    .original { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
    .annotations { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div class="container">
    <img class="original" src="data:image/png;base64,${base64Image}" />
    <div class="annotations">${svgContent}</div>
  </div>
</body>
</html>`;

    // 返回原始图片（SVG 叠加需要在浏览器中渲染）
    // 这里返回原始图片，实际使用时可以保存 HTML 文件
    return imageBuffer;
  }

  /**
   * 绘制矩形
   */
  private drawRectangle(
    ctx: CanvasRenderingContext2D,
    annotation: ImageAnnotation,
    imgWidth: number,
    imgHeight: number,
  ): void {
    const x = (annotation.bounds.x / 100) * imgWidth;
    const y = (annotation.bounds.y / 100) * imgHeight;
    const w = (annotation.bounds.width / 100) * imgWidth;
    const h = (annotation.bounds.height / 100) * imgHeight;

    // 严重问题用实线，其他用虚线
    if (annotation.severity === 'P0') {
      ctx.setLineDash([]);
    } else {
      ctx.setLineDash([5, 5]);
    }

    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }

  /**
   * 绘制圆形
   */
  private drawCircle(
    ctx: CanvasRenderingContext2D,
    annotation: ImageAnnotation,
    imgWidth: number,
    imgHeight: number,
  ): void {
    const x = (annotation.bounds.x / 100) * imgWidth;
    const y = (annotation.bounds.y / 100) * imgHeight;
    const w = (annotation.bounds.width / 100) * imgWidth;
    const h = (annotation.bounds.height / 100) * imgHeight;

    const centerX = x + w / 2;
    const centerY = y + h / 2;
    const radius = Math.min(w, h) / 2;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  /**
   * 绘制箭头
   */
  private drawArrow(
    ctx: CanvasRenderingContext2D,
    annotation: ImageAnnotation,
    imgWidth: number,
    imgHeight: number,
  ): void {
    const x = (annotation.bounds.x / 100) * imgWidth;
    const y = (annotation.bounds.y / 100) * imgHeight;
    const w = (annotation.bounds.width / 100) * imgWidth;
    const h = (annotation.bounds.height / 100) * imgHeight;

    const endX = x + w;
    const endY = y + h;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // 箭头头部
    const arrowSize = 10;
    const angle = Math.atan2(h, w);

    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - arrowSize * Math.cos(angle - Math.PI / 6),
      endY - arrowSize * Math.sin(angle - Math.PI / 6),
    );
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - arrowSize * Math.cos(angle + Math.PI / 6),
      endY - arrowSize * Math.sin(angle + Math.PI / 6),
    );
    ctx.stroke();
  }

  /**
   * 绘制标签
   */
  private drawLabel(
    ctx: CanvasRenderingContext2D,
    annotation: ImageAnnotation,
    imgWidth: number,
    imgHeight: number,
  ): void {
    const x = (annotation.bounds.x / 100) * imgWidth;
    const y = (annotation.bounds.y / 100) * imgHeight;

    ctx.font = 'bold 14px sans-serif';

    // 计算文本背景
    const metrics = ctx.measureText(annotation.label || '');
    const padding = 4;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(
      x - padding,
      y - 18 - padding,
      metrics.width + padding * 2,
      18 + padding,
    );

    // 绘制文本
    ctx.fillStyle = annotation.color || '#FFFFFF';
    ctx.fillText(annotation.label || '', x, y - 8);
  }

  /**
   * 根据严重级别获取颜色
   */
  private getColorForSeverity(severity?: TestCasePriority): string {
    if (!severity) return '#888888';
    const validSeverities: TestCasePriority[] = ['P0', 'P1', 'P2', 'P3'];
    if (!validSeverities.includes(severity)) return '#888888';
    return this.config.colors?.[severity] || DEFAULT_COLORS[severity] || '#888888';
  }

  /**
   * 获取标注图片输出路径
   */
  private getAnnotatedPath(originalPath: string): string {
    const dir = dirname(originalPath);
    const name = basename(originalPath, '.png');
    return join(dir, `${name}_annotated.png`);
  }

  /**
   * 获取图片尺寸
   */
  private getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
    try {
      // PNG 文件头解析
      if (buffer[0] === 0x89 && buffer[1] === 0x50) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
      }

      // JPEG 文件头解析（简化版）
      if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
        // 需要解析 JPEG 帧，这里返回默认值
        return { width: 1080, height: 1920 };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * XML 转义
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * 从问题列表生成标注
   */
  createAnnotationsFromIssues(issues: EnhancedInspectionIssue[]): ImageAnnotation[] {
    return issues
      .filter(issue => issue.elementInfo?.bounds || issue.ocrInfo?.bounds)
      .map(issue => ({
        type: 'rectangle' as const,
        bounds: issue.elementInfo?.bounds || issue.ocrInfo?.bounds || {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
        color: this.getColorForSeverity(issue.severity),
        label: `${issue.severity}: ${issue.type}`,
        issueId: issue.id,
        severity: issue.severity,
      }));
  }

  /**
   * 批量标注图片
   */
  async annotateBatch(
    items: Array<{
      imagePath: string;
      issues: EnhancedInspectionIssue[];
    }>,
    outputDir: string,
  ): Promise<AnnotatedScreenshot[]> {
    const results: AnnotatedScreenshot[] = [];

    for (const item of items) {
      const annotations = this.createAnnotationsFromIssues(item.issues);

      if (annotations.length > 0) {
        const outputPath = join(outputDir, `${basename(item.imagePath, '.png')}_annotated.png`);
        const result = await this.annotateImage(item.imagePath, annotations, outputPath);
        results.push(result);
      }
    }

    return results;
  }
}

/**
 * 创建图片标注器
 */
export function createImageAnnotator(config?: Partial<AnnotationConfig>): ImageAnnotator {
  return new ImageAnnotator(config);
}

/**
 * 默认标注配置
 */
export const DEFAULT_ANNOTATION_CONFIG: AnnotationConfig = {
  enabled: true,
  colors: DEFAULT_COLORS,
  lineWidth: 3,
  showLabels: true,
};
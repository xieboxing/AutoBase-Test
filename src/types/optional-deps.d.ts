/**
 * Optional dependencies type declarations
 * These modules are optional and may not be installed
 */

declare module 'canvas' {
  export function createCanvas(width: number, height: number): unknown;
  export function loadImage(source: Buffer | string): Promise<{
    width: number;
    height: number;
  }>;
}

declare module 'tesseract.js' {
  export function recognize(
    image: string | Buffer,
    lang: string,
    options?: unknown
  ): Promise<{
    data: {
      text: string;
      words: Array<{
        text: string;
        confidence: number;
        bbox: { x0: number; y0: number; x1: number; y1: number };
      }>;
    };
  }>;
}
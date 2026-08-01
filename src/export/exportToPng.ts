// PNG / JPG 导出：把 elements 画到 offscreen canvas，再 toBlob 下载。
//
// 复用运行时同一套 renderElement（含 RoughJS），保证导出结果 = 屏幕所见。
// 支持指定 scale（默认 2，输出更清晰）和背景（默认白色，透明传 null）。

import { RoughCanvas } from 'roughjs/bin/canvas';
import type { ExcalidrawElement } from '@/element/types';
import { renderElement } from '@/renderer/renderElement';
import { getExportBounds } from './exportBounds';

export interface PngExportOptions {
  scale?: number;      // 默认 2
  background?: string | null; // 默认 '#ffffff'；null / 'transparent' 表示不填背景
  padding?: number;    // 默认 20
  mimeType?: 'image/png' | 'image/jpeg';
  quality?: number;    // jpeg 时生效，0-1
}

export async function renderToBlob(
  elements: readonly ExcalidrawElement[],
  opts: PngExportOptions = {},
): Promise<{ blob: Blob; width: number; height: number } | null> {
  const {
    scale = 2,
    background = '#ffffff',
    padding = 20,
    mimeType = 'image/png',
    quality = 0.92,
  } = opts;

  const rect = getExportBounds(elements, padding);
  if (!rect) return null;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (background && background !== 'transparent') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-rect.x, -rect.y);
  const rc = new RoughCanvas(canvas);
  for (const el of elements) renderElement(ctx, rc, el);
  ctx.restore();

  return await new Promise<{ blob: Blob; width: number; height: number } | null>(resolve => {
    canvas.toBlob(
      b => resolve(b ? { blob: b, width: canvas.width, height: canvas.height } : null),
      mimeType,
      quality,
    );
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportToPng(
  elements: readonly ExcalidrawElement[],
  filename = `mini-excalidraw-${Date.now()}.png`,
  opts: PngExportOptions = {},
): Promise<void> {
  const res = await renderToBlob(elements, opts);
  if (!res) { console.warn('[export] empty scene'); return; }
  downloadBlob(res.blob, filename);
}

export async function exportToJpg(
  elements: readonly ExcalidrawElement[],
  filename = `mini-excalidraw-${Date.now()}.jpg`,
  opts: PngExportOptions = {},
): Promise<void> {
  const res = await renderToBlob(elements, { background: '#ffffff', ...opts, mimeType: 'image/jpeg' });
  if (!res) { console.warn('[export] empty scene'); return; }
  downloadBlob(res.blob, filename);
}
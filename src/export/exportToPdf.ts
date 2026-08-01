// PDF 导出：复用 PNG 的离屏 canvas 渲染，再把图片嵌进 PDF 单页。
//
// 依赖：`pnpm add jspdf`
// 方案说明：
// - PDF 本身既能塞矢量也能塞位图。为了跟屏幕一致（含 RoughJS 手绘感），
//   这里走"位图路线"：canvas.toDataURL('image/png') → pdf.addImage()。
// - 页面尺寸自动按内容外接矩形算，1pt = 1px 简单换算（不做真实印刷版式）。
// - scale 决定图像分辨率：默认 2，Retina 打印也不糊。

import { jsPDF } from 'jspdf';
import { RoughCanvas } from 'roughjs/bin/canvas';
import type { ExcalidrawElement } from '@/element/types';
import { renderElement } from '@/renderer/renderElement';
import { getExportBounds } from './exportBounds';

export interface PdfExportOptions {
  scale?: number;        // 位图分辨率倍数，默认 2
  background?: string | null; // 默认白色
  padding?: number;      // 默认 20
  orientation?: 'p' | 'l' | 'portrait' | 'landscape'; // jsPDF 默认按宽高自动
}

export async function exportToPdf(
  elements: readonly ExcalidrawElement[],
  filename = `mini-excalidraw-${Date.now()}.pdf`,
  opts: PdfExportOptions = {},
): Promise<void> {
  const { scale = 2, background = '#ffffff', padding = 20, orientation } = opts;

  const rect = getExportBounds(elements, padding);
  if (!rect) { console.warn('[export] empty scene'); return; }

  // 1) 画到离屏 canvas
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

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

  const dataUrl = canvas.toDataURL('image/png');

  // 2) 塞到 PDF：单页尺寸 = 内容尺寸（pt），保持 1:1 比例
  const pdfWidth = rect.width;
  const pdfHeight = rect.height;
  const finalOrientation = orientation ?? (pdfWidth > pdfHeight ? 'l' : 'p');
  const pdf = new jsPDF({
    orientation: finalOrientation,
    unit: 'pt',
    format: [pdfWidth, pdfHeight],
    compress: true,
  });
  pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
  pdf.save(filename);
}
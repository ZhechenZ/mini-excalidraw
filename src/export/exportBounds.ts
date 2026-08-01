// 计算导出所需的整体外接矩形（可选 padding）。
// 不复用 element/bounds.ts 的 getCommonBounds 是因为导出还想加 padding，
// 并且返回 {x, y, width, height} 更贴近 canvas / svg 使用习惯。

import type { ExcalidrawElement } from '@/element/types';
import { getElementBounds } from '@/element/bounds';

export interface ExportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getExportBounds(
  elements: readonly ExcalidrawElement[],
  padding = 20,
): ExportRect | null {
  if (elements.length === 0) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const el of elements) {
    const b = getElementBounds(el);
    if (b.x1 < x1) x1 = b.x1;
    if (b.y1 < y1) y1 = b.y1;
    if (b.x2 > x2) x2 = b.x2;
    if (b.y2 > y2) y2 = b.y2;
  }
  return {
    x: x1 - padding,
    y: y1 - padding,
    width: (x2 - x1) + padding * 2,
    height: (y2 - y1) + padding * 2,
  };
}
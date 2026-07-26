import type { ExcalidrawElement } from '@/element/types';
import { getCommonBounds } from '@/element/bounds';
import { getTransformHandles } from '@/element/transformHandles';

export function renderSelection(
  ctx: CanvasRenderingContext2D,
  selected: ExcalidrawElement[],
  zoom: number,
) {
  if (selected.length === 0) return;
  const b = getCommonBounds(selected);
  const pad = 4 / zoom;
  const x = b.x1 - pad, y = b.y1 - pad;
  const w = (b.x2 - b.x1) + pad * 2, h = (b.y2 - b.y1) + pad * 2;

  ctx.save();
  ctx.strokeStyle = '#6965db';
  ctx.lineWidth = 1 / zoom;
  ctx.setLineDash([4 / zoom, 4 / zoom]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  // 8 个手柄（位置从 transformHandles 单一来源）
  const handles = getTransformHandles(selected, zoom);
  ctx.fillStyle = '#fff';
  for (const hd of handles) {
    ctx.beginPath();
    ctx.rect(hd.x - hd.size / 2, hd.y - hd.size / 2, hd.size, hd.size);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// 框选矩形（进行中）
export function renderMarquee(
  ctx: CanvasRenderingContext2D,
  m: { x: number; y: number; width: number; height: number },
  zoom: number,
) {
  ctx.save();
  ctx.strokeStyle = 'rgba(105, 101, 219, 0.6)';
  ctx.fillStyle = 'rgba(105, 101, 219, 0.1)';
  ctx.lineWidth = 1 / zoom;
  ctx.setLineDash([4 / zoom, 4 / zoom]);
  ctx.fillRect(m.x, m.y, m.width, m.height);
  ctx.strokeRect(m.x, m.y, m.width, m.height);
  ctx.setLineDash([]);
  ctx.restore();
}
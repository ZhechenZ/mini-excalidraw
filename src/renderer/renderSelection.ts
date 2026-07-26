import type { ExcalidrawElement } from '@/element/types';
import { getCommonBounds } from '@/element/bounds';

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

  // 8 个手柄（Day 4 再让它们响应）
  const handleSize = 8 / zoom;
  const positions: [number, number][] = [
    [x, y], [x + w / 2, y], [x + w, y],
    [x, y + h / 2],         [x + w, y + h / 2],
    [x, y + h], [x + w / 2, y + h], [x + w, y + h],
  ];
  ctx.fillStyle = '#fff';
  for (const [hx, hy] of positions) {
    ctx.beginPath();
    ctx.rect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
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
  ctx.strokeStyle = '#6965db';
  ctx.fillStyle = 'rgba(105, 101, 219, 0.1)';
  ctx.lineWidth = 1 / zoom;
  ctx.fillRect(m.x, m.y, m.width, m.height);
  ctx.strokeRect(m.x, m.y, m.width, m.height);
  ctx.restore();
}
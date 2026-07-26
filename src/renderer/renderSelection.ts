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

  // ✅ Day 6：单选并且带有旋转时，坐标系旋转对齐元素，绘制选中框与手柄
  const isSingleRotated = selected.length === 1 && !!selected[0].angle;
  if (isSingleRotated) {
    const el = selected[0];
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(el.angle);
    ctx.translate(-cx, -cy);
  }

  ctx.setLineDash([4 / zoom, 4 / zoom]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  const handles = getTransformHandles(selected, zoom);
  ctx.fillStyle = '#fff';
  for (const hd of handles) {
    if (hd.direction === 'rotate') {
      // 连接线：包围盒顶部中点 → 旋转手柄
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(hd.x, hd.y + hd.size / 2);
      ctx.stroke();
      // 圆形旋转手柄
      ctx.beginPath();
      ctx.arc(hd.x, hd.y, hd.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // 方形缩放手柄
      ctx.beginPath();
      ctx.rect(hd.x - hd.size / 2, hd.y - hd.size / 2, hd.size, hd.size);
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.restore();
}

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
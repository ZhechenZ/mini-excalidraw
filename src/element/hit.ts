import type { ExcalidrawElement } from './types';
import { getElementBounds } from './bounds';
import { rotatePoint } from './rotate';

const THRESHOLD = 6;

export function hitTest(
  el: ExcalidrawElement,
  px: number,
  py: number,
): boolean {
  // ✅ Day 6：把 pointer 反向旋转到元素本地坐标系，再按老逻辑判命中
  if (el.angle) {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const p = rotatePoint(px, py, cx, cy, -el.angle);
    px = p.x;
    py = p.y;
  }
  switch (el.type) {
    case 'rectangle':
      return hitRectangle(el, px, py);
    case 'ellipse':
      return hitEllipse(el, px, py);
    case 'line':
    case 'arrow':
      return hitLine(el, px, py);
  }
}

function hitRectangle(el: ExcalidrawElement, px: number, py: number): boolean {
  const b = getElementBounds(el);
  const inside = px >= b.x1 && px <= b.x2 && py >= b.y1 && py <= b.y2;
  if (el.backgroundColor !== 'transparent') return inside;
  if (!inside) return false;
  return (
    Math.abs(px - b.x1) < THRESHOLD ||
    Math.abs(px - b.x2) < THRESHOLD ||
    Math.abs(py - b.y1) < THRESHOLD ||
    Math.abs(py - b.y2) < THRESHOLD
  );
}

function hitEllipse(el: ExcalidrawElement, px: number, py: number): boolean {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const a = Math.abs(el.width / 2);
  const b = Math.abs(el.height / 2);
  if (a === 0 || b === 0) return false;
  const value = ((px - cx) / a) ** 2 + ((py - cy) / b) ** 2;
  if (el.backgroundColor !== 'transparent') return value <= 1;
  return Math.abs(value - 1) < 0.15;
}

function hitLine(el: ExcalidrawElement, px: number, py: number): boolean {
  const x1 = el.x, y1 = el.y;
  const x2 = el.x + el.width, y2 = el.y + el.height;
  return pointToSegmentDistance(px, py, x1, y1, x2, y2) < THRESHOLD;
}

export function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  // ✅ 顺手修复 Day 3 遗留 bug：整体除以 lenSq
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

// 框选：仍然使用未旋转的 AABB。旋转元素框选采用近似判断，Day6 暂不实现精确多边形相交
export function hitMarquee(
  el: ExcalidrawElement,
  m: { x: number; y: number; width: number; height: number },
): boolean {
  const b = getElementBounds(el);
  const mx1 = Math.min(m.x, m.x + m.width);
  const my1 = Math.min(m.y, m.y + m.height);
  const mx2 = Math.max(m.x, m.x + m.width);
  const my2 = Math.max(m.y, m.y + m.height);
  return !(b.x2 < mx1 || b.x1 > mx2 || b.y2 < my1 || b.y1 > my2);
}
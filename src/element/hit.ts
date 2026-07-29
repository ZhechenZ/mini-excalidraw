import type { ExcalidrawElement, ExcalidrawFreedrawElement, ExcalidrawTextElement } from './types';
import { getElementBounds } from './bounds';
import { rotatePoint } from './rotate';

const THRESHOLD = 6;
// ✅ text 点击容差：往外扩一圈，让细字体也好点
const TEXT_HIT_PADDING = 4;

export function hitTest(el: ExcalidrawElement, px: number, py: number): boolean {
    if (el.angle) {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const p = rotatePoint(px, py, cx, cy, -el.angle);
        px = p.x; py = p.y;
    }
    switch (el.type) {
        case 'rectangle': return hitRectangle(el, px, py);
        case 'ellipse':   return hitEllipse(el, px, py);
        case 'line':
        case 'arrow':     return hitLine(el, px, py);
        case 'freedraw':  return hitFreedraw(el, px, py);
        case 'text':      return hitText(el, px, py);
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
    return pointToSegmentDistance(px, py, el.x, el.y, el.x + el.width, el.y + el.height) < THRESHOLD;
}

function hitFreedraw(el: ExcalidrawFreedrawElement, px: number, py: number): boolean {
    const pts = el.points;
    if (pts.length < 2) return false;
    const threshold = Math.max(THRESHOLD, el.strokeWidth * 2);
    for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        const d = pointToSegmentDistance(
            px, py, el.x + ax, el.y + ay, el.x + bx, el.y + by,
        );
        if (d < threshold) return true;
    }
    return false;
}

// ✅ Week 2：text 命中 = 元素 AABB + 外扩 TEXT_HIT_PADDING
// 修复原来 py <= el.height 的严重 bug（应为 py <= el.y + el.height）
function hitText(el: ExcalidrawTextElement, px: number, py: number): boolean {
    const pad = TEXT_HIT_PADDING;
    return (
        px >= el.x - pad &&
        px <= el.x + el.width + pad &&
        py >= el.y - pad &&
        py <= el.y + el.height + pad
    );
}

export function pointToSegmentDistance(
    px: number, py: number, x1: number, y1: number, x2: number, y2: number,
): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
}

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
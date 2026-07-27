import type { ExcalidrawElement, ExcalidrawFreedrawElement } from './types';
import { getElementBounds } from './bounds';
import { rotatePoint } from './rotate';

const THRESHOLD = 6;

export function hitTest(
    el: ExcalidrawElement,
    px: number,
    py: number,
): boolean {
    // 把 pointer 反向旋转到元素本地坐标系再做具体判定
    if (el.angle) {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const p = rotatePoint(px, py, cx, cy, -el.angle);
        px = p.x;
        py = p.y;
    }
    switch (el.type) {
        case 'rectangle': return hitRectangle(el, px, py);
        case 'ellipse':   return hitEllipse(el, px, py);
        case 'line':
        case 'arrow':     return hitLine(el, px, py);
        case 'freedraw':  return hitFreedraw(el, px, py);
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

// Week 1：freedraw 命中判定
function hitFreedraw(el: ExcalidrawFreedrawElement, px: number, py: number): boolean {
    const pts = el.points;
    if (pts.length < 2) return false;
    // strokeWidth 越粗，命中阈值越宽松
    const threshold = Math.max(THRESHOLD, el.strokeWidth * 2);
    for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        const d = pointToSegmentDistance(
            px, py,
            el.x + ax, el.y + ay,
            el.x + bx, el.y + by,
        );
        if (d < threshold) return true;
    }
    return false;
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
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
}

// 框选依旧使用 AABB。旋转元素/freedraw 用外接矩形近似，Week 4 换 R-tree 精确判定
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
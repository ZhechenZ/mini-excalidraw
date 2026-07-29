import type { ExcalidrawElement } from './types';

export interface Bounds {
    x1: number; y1: number; x2: number; y2: number;
}

export function getElementBounds(el: ExcalidrawElement): Bounds {
    if (el.type === 'freedraw') {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [px, py] of el.points) {
            if (px < minX) minX = px; if (py < minY) minY = py;
            if (px > maxX) maxX = px; if (py > maxY) maxY = py;
        }
        if (!isFinite(minX)) return { x1: el.x, y1: el.y, x2: el.x, y2: el.y };
        return { x1: el.x + minX, y1: el.y + minY, x2: el.x + maxX, y2: el.y + maxY };
    }
    const x1 = Math.min(el.x, el.x + el.width);
    const y1 = Math.min(el.y, el.y + el.height);
    const x2 = Math.max(el.x, el.x + el.width);
    const y2 = Math.max(el.y, el.y + el.height);
    return { x1, y1, x2, y2 };
}

export function getCommonBounds(els: ExcalidrawElement[]): Bounds {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const el of els) {
        const b = getElementBounds(el);
        if (b.x1 < x1) x1 = b.x1;
        if (b.y1 < y1) y1 = b.y1;
        if (b.x2 > x2) x2 = b.x2;
        if (b.y2 > y2) y2 = b.y2;
    }
    return { x1, y1, x2, y2 };
}
import { nanoid } from 'nanoid';
import type {
    ExcalidrawElement,
    ExcalidrawRectangleElement,
    ExcalidrawArrowElement,
    ExcalidrawEllipseElement,
    ExcalidrawLineElement,
    ExcalidrawFreedrawElement,
} from './types';

const randomInteger = () => Math.floor(Math.random() * 2 ** 31);

interface NewElementProps {
    x: number;
    y: number;
    width?: number;
    height?: number;
    strokeColor?: string;
    backgroundColor?: string;
    strokeWidth?: number;
}

function baseElement(props: NewElementProps) {
    return {
        id: nanoid(),
        x: props.x,
        y: props.y,
        width: props.width ?? 0,
        height: props.height ?? 0,
        angle: 0,
        strokeColor: props.strokeColor ?? '#1e1e1e',
        backgroundColor: props.backgroundColor ?? 'transparent',
        strokeWidth: props.strokeWidth ?? 2,
        roughness: 1,
        seed: randomInteger(),
        version: 1,
        versionNonce: randomInteger(),
    };
}

export function newRectangleElement(p: NewElementProps): ExcalidrawRectangleElement {
    return { ...baseElement(p), type: 'rectangle' };
}

export function newEllipseElement(p: NewElementProps): ExcalidrawEllipseElement {
    return { ...baseElement(p), type: 'ellipse' };
}

export function newLineElement(p: NewElementProps): ExcalidrawLineElement {
    return { ...baseElement(p), type: 'line' };
}

export function newArrowElement(p: NewElementProps): ExcalidrawArrowElement {
    return { ...baseElement(p), type: 'arrow' };
}

// Week 1：freedraw
export function newFreedrawElement(p: NewElementProps): ExcalidrawFreedrawElement {
    return {
        ...baseElement(p),
        type: 'freedraw',
        points: [[0, 0, 0.5]], // 起点相对自身偏移永远是 (0, 0)
    };
}

export type DrawableTool = 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'freedraw';

export function newElementByTool(
    tool: DrawableTool,
    p: NewElementProps,
    opts: { roughness: number; strokeColor?: string; backgroundColor?: string; strokeWidth?: number },
): ExcalidrawElement {
    const merged: NewElementProps = {
        ...p,
        strokeColor: opts.strokeColor ?? p.strokeColor,
        backgroundColor: opts.backgroundColor ?? p.backgroundColor,
        strokeWidth: opts.strokeWidth ?? p.strokeWidth,
    };
    let el: ExcalidrawElement;
    switch (tool) {
        case 'rectangle': el = newRectangleElement(merged); break;
        case 'ellipse':   el = newEllipseElement(merged); break;
        case 'line':      el = newLineElement(merged); break;
        case 'arrow':     el = newArrowElement(merged); break;
        case 'freedraw':  el = newFreedrawElement(merged); break;
        default: throw new Error(`unsupported drawing tool: ${tool}`);
    }
    el.roughness = opts.roughness;
    return el;
}

/**
 * 拖动过程中更新终点：把 (x2, y2) 转成 (x, y, width, height)
 * 允许负宽高（往左上拖），最后 pointerup 时再规范化。
 * freedraw 不走这条路径，见 pushFreedrawPoint。
 */
export function mutateElementEnd(
    el: ExcalidrawElement,
    x2: number,
    y2: number,
): ExcalidrawElement {
    if (el.type === 'freedraw') return el;
    return {
        ...el,
        width: x2 - el.x,
        height: y2 - el.y,
        version: el.version + 1,
        versionNonce: randomInteger(),
    };
}

/**
 * Week 1：freedraw 专用 —— pointerMove 每次追加一个采样点。
 * 同时同步维护 width/height（用于 bounds、marquee、后续 resize）。
 */
export function pushFreedrawPoint(
    el: ExcalidrawFreedrawElement,
    x: number,
    y: number,
    pressure: number,
): ExcalidrawFreedrawElement {
    const relX = x - el.x;
    const relY = y - el.y;
    const points = [...el.points, [relX, relY, pressure] as [number, number, number]];

    let minX = 0, minY = 0, maxX = 0, maxY = 0;
    for (const [px, py] of points) {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
    }

    return {
        ...el,
        points,
        width: maxX - minX,
        height: maxY - minY,
        version: el.version + 1,
        versionNonce: randomInteger(),
    };
}

/**
 * pointerup 时规范化：矩形/椭圆保证 width/height 都是正数、起点是左上角。
 * 直线 / 箭头保留负分量（表方向），freedraw 用相对偏移已自洽，都跳过。
 */
export function normalizeElement(el: ExcalidrawElement): ExcalidrawElement {
    if (el.type === 'line' || el.type === 'arrow' || el.type === 'freedraw') {
        return el;
    }
    const x = Math.min(el.x, el.x + el.width);
    const y = Math.min(el.y, el.y + el.height);
    return {
        ...el,
        x,
        y,
        width: Math.abs(el.width),
        height: Math.abs(el.height),
    };
}
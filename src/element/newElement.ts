import { nanoid } from 'nanoid';
import type {
    ExcalidrawElement,
    ExcalidrawRectangleElement,
    ExcalidrawArrowElement,
    ExcalidrawEllipseElement,
    ExcalidrawLineElement,
    ExcalidrawFreedrawElement,
    ExcalidrawTextElement,
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
    groupIds?: string[];
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
        groupIds: props.groupIds ?? [], // ✅ Week 2
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
export function newFreedrawElement(p: NewElementProps): ExcalidrawFreedrawElement {
    return {
        ...baseElement(p),
        type: 'freedraw',
        points: [[0, 0, 0.5]],
    };
}

// ✅ Week 2：text
export function newTextElement(
    p: NewElementProps & { text?: string; fontSize?: number; fontFamily?: string; textAlign?: 'left' | 'center' | 'right' },
): ExcalidrawTextElement {
    const fontSize = p.fontSize ?? 20;
    return {
        ...baseElement(p),
        type: 'text',
        text: p.text ?? '',
        fontSize,
        fontFamily: p.fontFamily ?? '"Xiaolai", "Comic Sans MS", "Segoe UI", sans-serif',
        textAlign: p.textAlign ?? 'left',
        baseline: fontSize * 0.8,
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

export function mutateElementEnd(el: ExcalidrawElement, x2: number, y2: number): ExcalidrawElement {
    if (el.type === 'freedraw' || el.type === 'text') return el;
    return {
        ...el,
        width: x2 - el.x,
        height: y2 - el.y,
        version: el.version + 1,
        versionNonce: randomInteger(),
    };
}

export function pushFreedrawPoint(
    el: ExcalidrawFreedrawElement, x: number, y: number, pressure: number,
): ExcalidrawFreedrawElement {
    const relX = x - el.x;
    const relY = y - el.y;
    const points = [...el.points, [relX, relY, pressure] as [number, number, number]];
    let minX = 0, minY = 0, maxX = 0, maxY = 0;
    for (const [px, py] of points) {
        if (px < minX) minX = px; if (py < minY) minY = py;
        if (px > maxX) maxX = px; if (py > maxY) maxY = py;
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

export function normalizeElement(el: ExcalidrawElement): ExcalidrawElement {
    if (el.type === 'line' || el.type === 'arrow' || el.type === 'freedraw' || el.type === 'text') {
        return el;
    }
    const x = Math.min(el.x, el.x + el.width);
    const y = Math.min(el.y, el.y + el.height);
    return { ...el, x, y, width: Math.abs(el.width), height: Math.abs(el.height) };
}

// ✅ Week 2：更新 text 的内容与尺寸（尺寸通过外部 measure 传入）
export function mutateText(
    el: ExcalidrawTextElement,
    text: string,
    measured: { width: number; height: number },
): ExcalidrawTextElement {
    return {
        ...el,
        text,
        width: measured.width,
        height: measured.height,
        version: el.version + 1,
        versionNonce: randomInteger(),
    };
}

// ✅ Week 2：复制时用来做 shallow clone 并重生 id/nonce
export function regenerateElementId(el: ExcalidrawElement): ExcalidrawElement {
    return {
        ...el,
        id: nanoid(),
        seed: randomInteger(),
        version: 1,
        versionNonce: randomInteger(),
    };
}
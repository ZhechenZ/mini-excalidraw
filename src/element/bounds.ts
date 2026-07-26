import type {ExcalidrawElement} from './types';

export interface Bounds {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export function getElementBounds(el:ExcalidrawElement):Bounds{
    const x1 = Math.min(el.x,el.x + el.width);
    const y1 = Math.min(el.y,el.y + el.height);
    const x2 = Math.max(el.x, el.x + el.width);
    const y2 = Math.max(el.y, el.y + el.height);
    return {x1,y1,x2,y2};;
}

// 多个元素合并成一个大的 bounding box (拖动多选 or 框选缩放要用)
export function getCommonBounds(els: ExcalidrawElement[]): Bounds {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for(const el of els){
        const b  = getElementBounds(el);
        if(b.x1 < x1) x1 = b.x1;
        if(b.y1 < y1) y1 = b.y1;
        if(b.x2 > x2) x2 = b.x2;
        if(b.y2 > y2) y2 = b.y2;
    }

    return {x1,y1,x2,y2};
}
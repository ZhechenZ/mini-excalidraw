import type { ExcalidrawElement } from './types';

/** 把选中的元素在数组中提到最后一层（视觉上最上层） */
export function bringToFront(
    elements: ExcalidrawElement[], selectedIds: Record<string, true>,
): ExcalidrawElement[] {
    const selected: ExcalidrawElement[] = [];
    const rest: ExcalidrawElement[] = [];
    for (const el of elements) {
        (selectedIds[el.id] ? selected : rest).push(el);
    }
    return [...rest, ...selected];
}

/** 沉到最底 */
export function sendToBack(
    elements: ExcalidrawElement[], selectedIds: Record<string, true>,
): ExcalidrawElement[] {
    const selected: ExcalidrawElement[] = [];
    const rest: ExcalidrawElement[] = [];
    for (const el of elements) {
        (selectedIds[el.id] ? selected : rest).push(el);
    }
    return [...selected, ...rest];
}

/** 单层上移：把每个选中项与它后面第一个"未选中"项交换 */
export function bringForward(
    elements: ExcalidrawElement[], selectedIds: Record<string, true>,
): ExcalidrawElement[] {
    const arr = [...elements];
    for (let i = arr.length - 2; i >= 0; i--) {
        if (selectedIds[arr[i].id] && !selectedIds[arr[i + 1].id]) {
            [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
        }
    }
    return arr;
}

/** 单层下移 */
export function sendBackward(
    elements: ExcalidrawElement[], selectedIds: Record<string, true>,
): ExcalidrawElement[] {
    const arr = [...elements];
    for (let i = 1; i < arr.length; i++) {
        if (selectedIds[arr[i].id] && !selectedIds[arr[i - 1].id]) {
            [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
        }
    }
    return arr;
}
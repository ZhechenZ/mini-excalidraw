import { nanoid } from 'nanoid';
import type { ExcalidrawElement } from './types';

export function groupElements(
    elements: ExcalidrawElement[], selectedIds: Record<string, true>,
): ExcalidrawElement[] {
    const ids = Object.keys(selectedIds);
    if (ids.length < 2) return elements;
    const groupId = 'g_' + nanoid(8);
    return elements.map(el =>
        selectedIds[el.id]
            ? { ...el, groupIds: [...el.groupIds, groupId], version: el.version + 1 } as ExcalidrawElement
            : el,
    );
}

export function ungroupElements(
    elements: ExcalidrawElement[], selectedIds: Record<string, true>,
): ExcalidrawElement[] {
    // 只弹掉栈顶那层 group
    return elements.map(el => {
        if (!selectedIds[el.id]) return el;
        if (el.groupIds.length === 0) return el;
        return { ...el, groupIds: el.groupIds.slice(0, -1), version: el.version + 1 } as ExcalidrawElement;
    });
}

/** 命中一个元素时，把它所在最外层 group 的所有兄弟一起选中 */
export function expandSelectionToGroup(
    elements: ExcalidrawElement[], hitId: string,
): Record<string, true> {
    const hit = elements.find(el => el.id === hitId);
    if (!hit || hit.groupIds.length === 0) return { [hitId]: true };
    const topGroup = hit.groupIds[hit.groupIds.length - 1];
    const ids: Record<string, true> = {};
    for (const el of elements) {
        if (el.groupIds.includes(topGroup)) ids[el.id] = true;
    }
    return ids;
}
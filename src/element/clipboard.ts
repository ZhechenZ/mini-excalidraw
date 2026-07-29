import type { ExcalidrawElement } from './types';
import { regenerateElementId } from './newElement';

const MIME = 'application/x-mini-excalidraw';
let memoryClipboard: ExcalidrawElement[] = [];

export async function copyToClipboard(elements: ExcalidrawElement[]) {
    memoryClipboard = elements.map(el => ({ ...el }));
    const payload = JSON.stringify({ type: MIME, elements });
    try {
        await navigator.clipboard.writeText(payload);
    } catch {
        // 无 clipboard 权限时只走内存副本
    }
}

export async function readFromClipboard(): Promise<ExcalidrawElement[]> {
    try {
        const text = await navigator.clipboard.readText();
        const parsed = JSON.parse(text);
        if (parsed?.type === MIME && Array.isArray(parsed.elements)) return parsed.elements;
    } catch { /* ignore */ }
    return memoryClipboard;
}

/** 粘贴前重置 id + 加位置偏移 */
export function preparePastedElements(
    src: ExcalidrawElement[], offset = 20,
): ExcalidrawElement[] {
    return src.map(el => {
        const cloned = regenerateElementId({ ...el, x: el.x + offset, y: el.y + offset });
        return cloned;
    });
}
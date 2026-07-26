import type { ExcalidrawElement } from './types';
import { getCommonBounds } from './bounds';

export type HandleDirection = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se';

export interface TransformHandle {
  direction: HandleDirection;
  x: number;     // canvas 坐标下的手柄中心
  y: number;
  size: number;  // canvas 坐标下的手柄边长
}

const HANDLE_PIXEL = 8;    // 手柄屏幕像素大小
const HIT_TOLERANCE = 4;   // 命中额外容差（像素）

/**
 * 计算选中元素集合的 8 个 transform 手柄位置
 * 返回值在 canvas 坐标系下（未受 zoom/scroll 变换），size 已按 zoom 换算
 */
export function getTransformHandles(
  selected: ExcalidrawElement[],
  zoom: number,
): TransformHandle[] {
  if (selected.length === 0) return [];
  const b = getCommonBounds(selected);
  const pad = 4 / zoom;
  const x = b.x1 - pad;
  const y = b.y1 - pad;
  const w = (b.x2 - b.x1) + pad * 2;
  const h = (b.y2 - b.y1) + pad * 2;
  const size = HANDLE_PIXEL / zoom;

  return [
    { direction: 'nw', x: x,         y: y,         size },
    { direction: 'n',  x: x + w / 2, y: y,         size },
    { direction: 'ne', x: x + w,     y: y,         size },
    { direction: 'w',  x: x,         y: y + h / 2, size },
    { direction: 'e',  x: x + w,     y: y + h / 2, size },
    { direction: 'sw', x: x,         y: y + h,     size },
    { direction: 's',  x: x + w / 2, y: y + h,     size },
    { direction: 'se', x: x + w,     y: y + h,     size },
  ];
}

/**
 * 命中检测：canvas 坐标是否落在某个手柄上，返回命中的方向
 */
export function hitTransformHandle(
  handles: TransformHandle[],
  px: number,
  py: number,
  zoom: number,
): HandleDirection | null {
  const tolerance = HIT_TOLERANCE / zoom;
  for (const h of handles) {
    const half = h.size / 2 + tolerance;
    if (Math.abs(px - h.x) <= half && Math.abs(py - h.y) <= half) {
      return h.direction;
    }
  }
  return null;
}

/** 手柄方向 → CSS cursor */
export function handleToCursor(dir: HandleDirection): string {
  switch (dir) {
    case 'n':
    case 's':  return 'ns-resize';
    case 'e':
    case 'w':  return 'ew-resize';
    case 'nw':
    case 'se': return 'nwse-resize';
    case 'ne':
    case 'sw': return 'nesw-resize';
  }
}
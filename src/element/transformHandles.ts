import type { ExcalidrawElement } from './types';
import { getCommonBounds } from './bounds';

export type HandleDirection =
  | 'nw' | 'n' | 'ne'
  | 'w' | 'e'
  | 'sw' | 's' | 'se'
  | 'rotate';

export interface TransformHandle {
  direction: HandleDirection;
  x: number;
  y: number;
  size: number;
}

const HANDLE_PIXEL = 8;
const HIT_TOLERANCE = 4;
const ROTATE_OFFSET_PIXEL = 30; // rotate handle 距离顶边 30 屏幕像素

/**
 * 计算选中元素的 transform handles。
 * - 多选：只返回 8 个方向手柄（不支持旋转）
 * - 单选：额外返回 1 个 rotate 手柄，位于顶边正上方
 * 返回坐标始终在「元素/共同 AABB 的本地坐标系」下（未应用 el.angle 旋转）。
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

  const handles: TransformHandle[] = [
    { direction: 'nw', x: x,           y: y,           size },
    { direction: 'n',  x: x + w / 2,   y: y,           size },
    { direction: 'ne', x: x + w,       y: y,           size },
    { direction: 'w',  x: x,           y: y + h / 2,   size },
    { direction: 'e',  x: x + w,       y: y + h / 2,   size },
    { direction: 'sw', x: x,           y: y + h,       size },
    { direction: 's',  x: x + w / 2,   y: y + h,       size },
    { direction: 'se', x: x + w,       y: y + h,       size },
  ];

  if (selected.length === 1) {
    handles.push({
      direction: 'rotate',
      x: x + w / 2,
      y: y - ROTATE_OFFSET_PIXEL / zoom,
      size,
    });
  }

  return handles;
}

export function hitTransformHandle(
  handles: TransformHandle[],
  px: number,
  py: number,
  zoom: number,
): HandleDirection | null {
  const tolerance = HIT_TOLERANCE / zoom;
  for (const h of handles) {
    const half = h.size / 2 + tolerance;
    if (h.direction === 'rotate') {
      // 圆形手柄：欧氏距离
      if (Math.hypot(px - h.x, py - h.y) <= half) return 'rotate';
    } else {
      if (Math.abs(px - h.x) <= half && Math.abs(py - h.y) <= half) {
        return h.direction;
      }
    }
  }
  return null;
}

export function handleToCursor(dir: HandleDirection): string {
  switch (dir) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'rotate':
      return 'grab';
  }
}
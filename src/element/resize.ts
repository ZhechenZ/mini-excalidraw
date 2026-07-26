import type { ExcalidrawElement } from './types';
import type { HandleDirection } from './transformHandles';
import type { Bounds } from './bounds';

const nonce = () => Math.floor(Math.random() * 2 ** 31);
const MIN_SIZE = 1;

/**
 * 根据手柄方向、原始 bounds 和当前指针位置，算出缩放后的新 bounds
 * shift = true 时锁定长宽比
 */
export function computeNewBounds(
  handle: HandleDirection,
  originalBounds: Bounds,
  pointerX: number,
  pointerY: number,
  shift: boolean,
): Bounds {
  let { x1, y1, x2, y2 } = originalBounds;

  // 把手柄对应的角/边移到 pointer
  switch (handle) {
    case 'nw': x1 = pointerX; y1 = pointerY; break;
    case 'n':                 y1 = pointerY; break;
    case 'ne': x2 = pointerX; y1 = pointerY; break;
    case 'w':  x1 = pointerX;                break;
    case 'e':  x2 = pointerX;                break;
    case 'sw': x1 = pointerX; y2 = pointerY; break;
    case 's':                 y2 = pointerY; break;
    case 'se': x2 = pointerX; y2 = pointerY; break;
  }

  // 防止塌成 0 或翻转（Day 4 先不做 flip）
  if (x2 - x1 < MIN_SIZE) {
    if (handle === 'w' || handle === 'nw' || handle === 'sw') x1 = x2 - MIN_SIZE;
    else                                                       x2 = x1 + MIN_SIZE;
  }
  if (y2 - y1 < MIN_SIZE) {
    if (handle === 'n' || handle === 'nw' || handle === 'ne') y1 = y2 - MIN_SIZE;
    else                                                       y2 = y1 + MIN_SIZE;
  }

  // Shift 锁比：以原始比例为准，把较大的一边往下压
  if (shift) {
    const ow = originalBounds.x2 - originalBounds.x1;
    const oh = originalBounds.y2 - originalBounds.y1;
    if (ow > 0 && oh > 0) {
      const ratio = ow / oh;
      const w = x2 - x1;
      const h = y2 - y1;
      if (w / ratio > h) {
        // 以 w 为准调 h
        const nh = w / ratio;
        if (handle === 'nw' || handle === 'ne' || handle === 'n') y1 = y2 - nh;
        else                                                       y2 = y1 + nh;
      } else {
        // 以 h 为准调 w
        const nw = h * ratio;
        if (handle === 'nw' || handle === 'sw' || handle === 'w') x1 = x2 - nw;
        else                                                       x2 = x1 + nw;
      }
    }
  }

  return { x1, y1, x2, y2 };
}

/**
 * 把一个元素按 (originalBounds → newBounds) 的比例映射到新位置和大小
 * 支持负宽高（直线/箭头方向保留）
 */
export function resizeElementByBounds(
  original: ExcalidrawElement,
  originalBounds: Bounds,
  newBounds: Bounds,
): ExcalidrawElement {
  const ow = originalBounds.x2 - originalBounds.x1 || 1;
  const oh = originalBounds.y2 - originalBounds.y1 || 1;
  const nw = newBounds.x2 - newBounds.x1;
  const nh = newBounds.y2 - newBounds.y1;

  const relX = (original.x - originalBounds.x1) / ow;
  const relY = (original.y - originalBounds.y1) / oh;
  const relW = original.width / ow;
  const relH = original.height / oh;

  return {
    ...original,
    x: newBounds.x1 + relX * nw,
    y: newBounds.y1 + relY * nh,
    width: relW * nw,
    height: relH * nh,
    version: original.version + 1,
    versionNonce: nonce(),
  };
}
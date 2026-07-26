import type { ExcalidrawElement } from './types';

const nonce = () => Math.floor(Math.random() * 2 ** 31);

/** 元素中心（未旋转的本地坐标 = 画布坐标下的旋转中心） */
export function getElementCenter(el: ExcalidrawElement): { cx: number; cy: number } {
  return {
    cx: el.x + el.width / 2,
    cy: el.y + el.height / 2,
  };
}

/**
 * 把画布坐标点 (px, py) 绕中心 (cx, cy) 旋转 angle 弧度
 * angle > 0 顺时针（与 canvas ctx.rotate 一致）
 */
export function rotatePoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  angle: number,
): { x: number; y: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

/**
 * 计算 pointer 相对元素中心的角度
 * 约定：pointer 正上方 = 0（因为 rotate handle 在正上方，希望它跟着 pointer 走）
 * 返回值范围任意（后续需要 normalize）
 */
export function angleFromPointer(px: number, py: number, cx: number, cy: number): number {
  return Math.atan2(py - cy, px - cx) + Math.PI / 2;
}

/** Shift 键锁定：吸附到 15° 的整数倍 */
export function snapAngle(angle: number): number {
  const step = Math.PI / 12; // 15°
  return Math.round(angle / step) * step;
}

/** 归一化到 (-PI, PI] */
export function normalizeAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** 设置元素的旋转角度，同时刷 version / versionNonce（便于 History 快照去重） */
export function setElementAngle(el: ExcalidrawElement, angle: number): ExcalidrawElement {
  return {
    ...el,
    angle,
    version: el.version + 1,
    versionNonce: nonce(),
  };
}
import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Options } from 'roughjs/bin/core';
import type { ExcalidrawElement } from '@/element/types';

export function renderElement(
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  el: ExcalidrawElement,
) {
  ctx.save();

  // Day 6：围绕元素中心旋转画布坐标系
  if (el.angle) {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(el.angle);
    ctx.translate(-cx, -cy);
  }

  const opts: Options = {
    seed: el.seed,
    stroke: el.strokeColor,
    strokeWidth: el.strokeWidth,
    roughness: el.roughness,
    fill: el.backgroundColor !== 'transparent' ? el.backgroundColor : undefined,
    fillStyle: 'hachure',
    hachureGap: 6,
    hachureAngle: -41,
    disableMultiStroke: false,
  };

  switch (el.type) {
    case 'rectangle':
      renderRectangle(rc, el, opts);
      break;
    case 'ellipse':
      renderEllipse(rc, el, opts);
      break;
    case 'line':
      renderLine(rc, el, opts);
      break;
    case 'arrow':
      renderArrow(rc, el, opts);
      break;
  }

  ctx.restore();
}

function renderRectangle(rc: RoughCanvas, el: ExcalidrawElement, opts: Options) {
  // rough.js 不支持负宽高，统一转换成正数包围盒
  const x = Math.min(el.x, el.x + el.width);
  const y = Math.min(el.y, el.y + el.height);
  const w = Math.abs(el.width);
  const h = Math.abs(el.height);
  if (w < 1 || h < 1) return;
  rc.rectangle(x, y, w, h, opts);
}

function renderEllipse(rc: RoughCanvas, el: ExcalidrawElement, opts: Options) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const w = Math.abs(el.width);
  const h = Math.abs(el.height);
  if (w < 1 || h < 1) return;
  rc.ellipse(cx, cy, w, h, opts);
}

function renderLine(rc: RoughCanvas, el: ExcalidrawElement, opts: Options) {
  const x1 = el.x;
  const y1 = el.y;
  const x2 = el.x + el.width;
  const y2 = el.y + el.height;
  rc.line(x1, y1, x2, y2, opts);
}

function renderArrow(rc: RoughCanvas, el: ExcalidrawElement, opts: Options) {
  const x1 = el.x;
  const y1 = el.y;
  const x2 = el.x + el.width;
  const y2 = el.y + el.height;
  rc.line(x1, y1, x2, y2, opts);

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 14;
  const headAngle = Math.PI / 6;
  const hx1 = x2 - headLen * Math.cos(angle - headAngle);
  const hy1 = y2 - headLen * Math.sin(angle - headAngle);
  const hx2 = x2 - headLen * Math.cos(angle + headAngle);
  const hy2 = y2 - headLen * Math.sin(angle + headAngle);
  rc.line(x2, y2, hx1, hy1, opts);
  rc.line(x2, y2, hx2, hy2, opts);
}
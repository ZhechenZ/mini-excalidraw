import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Options } from 'roughjs/bin/core';
import type { ExcalidrawElement, ExcalidrawFreedrawElement } from '@/element/types';

export function renderElement(
    ctx: CanvasRenderingContext2D,
    rc: RoughCanvas,
    el: ExcalidrawElement,
) {
    ctx.save();

    // 围绕元素中心旋转画布坐标系
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
        case 'rectangle': renderRectangle(rc, el, opts); break;
        case 'ellipse':   renderEllipse(rc, el, opts); break;
        case 'line':      renderLine(rc, el, opts); break;
        case 'arrow':     renderArrow(rc, el, opts); break;
        case 'freedraw':  renderFreedraw(ctx, el); break; // Week 1
    }

    ctx.restore();
}

function renderRectangle(rc: RoughCanvas, el: ExcalidrawElement, opts: Options) {
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

/**
 * Week 1：freedraw 原生折线渲染（Week 5 换 perfect-freehand + Path2D 缓存）
 * 手绘不走 rough，避免抖动破坏笔迹形状。
 */
function renderFreedraw(ctx: CanvasRenderingContext2D, el: ExcalidrawFreedrawElement) {
    if (el.points.length < 2) {
        // 只有一个点：画个圆点做占位
        if (el.points.length === 1) {
            ctx.save();
            ctx.fillStyle = el.strokeColor;
            ctx.beginPath();
            ctx.arc(el.x + el.points[0][0], el.y + el.points[0][1], el.strokeWidth / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        return;
    }
    ctx.save();
    ctx.strokeStyle = el.strokeColor;
    ctx.lineWidth = el.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(el.x + el.points[0][0], el.y + el.points[0][1]);
    for (let i = 1; i < el.points.length; i++) {
        ctx.lineTo(el.x + el.points[i][0], el.y + el.points[i][1]);
    }
    ctx.stroke();
    ctx.restore();
}
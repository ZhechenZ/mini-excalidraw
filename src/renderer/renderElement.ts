import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Options } from 'roughjs/bin/core';
import type { ExcalidrawElement, ExcalidrawFreedrawElement, ExcalidrawTextElement } from '@/element/types';

export function renderElement(
    ctx: CanvasRenderingContext2D, rc: RoughCanvas, el: ExcalidrawElement,
) {
    ctx.save();
    if (el.angle) {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        ctx.translate(cx, cy); ctx.rotate(el.angle); ctx.translate(-cx, -cy);
    }
    const opts: Options = {
        seed: el.seed, stroke: el.strokeColor, strokeWidth: el.strokeWidth,
        roughness: el.roughness,
        fill: el.backgroundColor !== 'transparent' ? el.backgroundColor : undefined,
        fillStyle: 'hachure', hachureGap: 6, hachureAngle: -41, disableMultiStroke: false,
    };
    switch (el.type) {
        case 'rectangle': renderRectangle(rc, el, opts); break;
        case 'ellipse':   renderEllipse(rc, el, opts); break;
        case 'line':      renderLine(rc, el, opts); break;
        case 'arrow':     renderArrow(rc, el, opts); break;
        case 'freedraw':  renderFreedraw(ctx, el); break;
        case 'text':      renderText(ctx, el); break; // ✅ Week 2
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
    rc.line(el.x, el.y, el.x + el.width, el.y + el.height, opts);
}

function renderArrow(rc: RoughCanvas, el: ExcalidrawElement, opts: Options) {
    const x1 = el.x, y1 = el.y, x2 = el.x + el.width, y2 = el.y + el.height;
    rc.line(x1, y1, x2, y2, opts);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 14, headAngle = Math.PI / 6;
    rc.line(x2, y2, x2 - headLen * Math.cos(angle - headAngle), y2 - headLen * Math.sin(angle - headAngle), opts);
    rc.line(x2, y2, x2 - headLen * Math.cos(angle + headAngle), y2 - headLen * Math.sin(angle + headAngle), opts);
}

function renderFreedraw(ctx: CanvasRenderingContext2D, el: ExcalidrawFreedrawElement) {
    if (el.points.length < 2) {
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
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(el.x + el.points[0][0], el.y + el.points[0][1]);
    for (let i = 1; i < el.points.length; i++) {
        ctx.lineTo(el.x + el.points[i][0], el.y + el.points[i][1]);
    }
    ctx.stroke();
    ctx.restore();
}

// ✅ Week 2：多行 text 渲染
function renderText(ctx: CanvasRenderingContext2D, el: ExcalidrawTextElement) {
    if (!el.text) return;
    ctx.save();
    ctx.font = `${el.fontSize}px ${el.fontFamily}`;
    ctx.fillStyle = el.strokeColor;
    ctx.textAlign = el.textAlign;
    ctx.textBaseline = 'alphabetic';
    const lines = el.text.split('\n');
    const lineHeight = el.fontSize * 1.25;
    let xAnchor = el.x;
    if (el.textAlign === 'center') xAnchor = el.x + el.width / 2;
    else if (el.textAlign === 'right') xAnchor = el.x + el.width;
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], xAnchor, el.y + el.baseline + i * lineHeight);
    }
    ctx.restore();
}

// ✅ Week 2：静态方法，用于 TextEditor blur 时算尺寸
export function measureText(
    text: string, fontSize: number, fontFamily: string,
): { width: number; height: number } {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = `${fontSize}px ${fontFamily}`;
    const lines = text.split('\n');
    let maxW = 0;
    for (const line of lines) {
        const w = ctx.measureText(line).width;
        if (w > maxW) maxW = w;
    }
    const lineHeight = fontSize * 1.25;
    return { width: Math.max(1, maxW), height: Math.max(fontSize, lines.length * lineHeight) };
}
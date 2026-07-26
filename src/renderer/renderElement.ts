import type { ExcalidrawElement } from "@/element/types";

export function renderElement(
    ctx:CanvasRenderingContext2D,
    el:ExcalidrawElement,
){
    ctx.save();
    ctx.strokeStyle = el.strokeColor;
    ctx.fillStyle = el.backgroundColor;
    ctx.lineWidth = el.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (el.type) {
        case 'rectangle':
            renderRectangle(ctx, el);
            break;
        case 'ellipse':
            renderEllipse(ctx, el);
            break;
        case 'line':
            renderLine(ctx, el);
            break;
        case 'arrow':
            renderArrow(ctx, el);
            break;    
    }

    ctx.restore();
}

function renderRectangle(
    ctx: CanvasRenderingContext2D,
    el:ExcalidrawElement,
){
    if(el.backgroundColor !== 'transparent'){
        ctx.fillRect(el.x, el.y, el.width, el.height);
    }

    ctx.strokeRect(el.x, el.y, el.width, el.height);
}

function renderEllipse(
    ctx:CanvasRenderingContext2D,
    el:ExcalidrawElement,
){
    const cx = el.x + el.width/2;
    const cy = el.y + el.height/2;
    const rx = Math.abs(el.width/2);
    const ry = Math.abs(el.height/2);
    ctx.beginPath();
    ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI * 2);
    if(el.backgroundColor !== 'transparent') ctx.fill();
    ctx.stroke();
}

function renderLine(
    ctx:CanvasRenderingContext2D,
    el:ExcalidrawElement,
){
    ctx.beginPath();
    ctx.moveTo(el.x,el.y);
    ctx.lineTo(el.x + el.width, el.y + el.height);
    ctx.stroke();
}

function renderArrow(
    ctx: CanvasRenderingContext2D,
    el:ExcalidrawElement,
){
    const x1=el.x;
    const y1=el.y;
    const x2=el.x+el.width;
    const y2=el.y+el.height;

    ctx.beginPath();
    ctx.moveTo(x1,y1);
    ctx.lineTo(x2,y2);
    ctx.stroke();

    //箭头头部: 长12, 夹角30°
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 12;
    const headAngle = Math.PI/6;
    ctx.beginPath();
    ctx.moveTo(x2,y2);
    ctx.lineTo(
        x2 - headLen * Math.cos(angle - headAngle),
        y2 - headLen * Math.sin(angle - headAngle),
    );
    ctx.moveTo(x2,y2);
    ctx.lineTo(
        x2 - headLen * Math.cos(angle + headAngle),
        y2 - headLen * Math.sin(angle + headAngle),
    );
    ctx.stroke();
}
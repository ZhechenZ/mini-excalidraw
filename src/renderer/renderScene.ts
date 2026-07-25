import type { AppState } from "@/state/appState";
import type { ExcalidrawElement } from "@/element/types";
import { renderElement } from "./renderElement";

interface RenderParams {
    canvas: HTMLCanvasElement;
    ctx:CanvasRenderingContext2D;
    elements:ExcalidrawElement[];
    appState:AppState;
    dpr:number;
}

export function renderScene({canvas,ctx,elements,appState,dpr}:RenderParams){
    //清空屏幕
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);

    //背景
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.restore();

    //应用 DPR + viewport 变换
    ctx.save();
    ctx.setTransform(
        dpr * appState.zoom, 0,
        0, dpr * appState.zoom,
        dpr * appState.scrollX,
        dpr * appState.scrollY,
    );

    //画一个坐标原点参考十字
    ctx.strokeStyle = '#c0c0c0';
    ctx.lineWidth = 1/appState.zoom;
    ctx.beginPath();
    ctx.moveTo(-50,0);
    ctx.lineTo(50,0);
    ctx.moveTo(0,-50);
    ctx.lineTo(0,50);
    ctx.stroke();

    for(const el of elements){
        renderElement(ctx, el);
    }
    ctx.restore();
}
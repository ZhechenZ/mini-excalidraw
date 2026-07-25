import React, { useEffect, useRef, useState } from "react";
import type { ExcalidrawElement } from "@/element/type";
import type { AppState } from "@/state/appState";
import { MAX_ZOOM, MIN_ZOOM } from "@/constants";
import { screenToCanvas } from "@/utils/viewport";
import { renderScene } from "@/renderer/renderScene";

interface CanvasProps {
    elements: ExcalidrawElement[];
    appState: AppState;
    onAppStateChange: (patch: Partial<AppState>) => void;
}

export function Canvas({elements, appState, onAppStateChange}: CanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [dpr, setDpr] = useState(window.devicePixelRatio || 1);
    const isSpaceDown = useRef(false);
    const panStart = useRef<{
        x:number;
        y:number;
        scrollX:number;
        scrollY:number;   
    } | null>(null);

    //自适应尺寸 & DPR
    useEffect(() => {
        const canvas = canvasRef.current;
        if(!canvas) return;
        const resize = () => {
            const newDpr = window.devicePixelRatio || 1;
            setDpr(newDpr);
            canvas.width = window.innerWidth * newDpr;
            canvas.height = window.innerHeight * newDpr;
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
        };
        resize();
        window.addEventListener('resize',resize);
        return () => window.removeEventListener('resize',resize);
    },[]);

    //重新绘制
    useEffect(() => {
        const canvas = canvasRef.current;
        if(!canvas){
            return ;
        }
        const ctx = canvas.getContext('2d');
        if(!ctx){
            return ;
        }
        renderScene({canvas, ctx, elements, appState, dpr})
    },[elements, appState, dpr]);

    //键盘: 空格 = 平移模式
    useEffect(() => {
        const down = (e:KeyboardEvent) => {
            if(e.code === 'Space'){
                isSpaceDown.current = true;
            }
        }
        const up = (e:KeyboardEvent) => {
            if(e.code === 'Space'){
                isSpaceDown.current = false;
            }
        }
        window.addEventListener('keydown',down);
        window.addEventListener('keyup',up);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
        };
    },[]);

    //滚轮: Ctrl/Cmd 缩放; 否则平移
    const onWheel = (e: React.WheelEvent) => {
        if(e.ctrlKey || e.metaKey){
            const delta = -e.deltaY * 0.01;
            const nextZoom = Math.min(
                MAX_ZOOM,
                Math.max(MIN_ZOOM, appState.zoom * (1 + delta)),
            );
            //以鼠标位置为中心缩放
            const mx = e.clientX;
            const my = e.clientY;
            const before = screenToCanvas({ x: mx, y: my }, appState);
            const nextScrollX = mx - before.x * nextZoom;
            const nextScrollY = my - before.y * nextZoom;
            onAppStateChange({
                zoom:nextZoom,
                scrollX: nextScrollX,
                scrollY: nextScrollY,
            });
        }else {
            onAppStateChange({
                scrollX: appState.scrollX - e.deltaX,
                scrollY: appState.scrollY - e.deltaY,
            });
        }
    };
    
    const onPointerDown = (e: React.PointerEvent) => {
        //中键 或 空格 + 左键 -> 平移
        if (e.button === 1 || (isSpaceDown.current && e.button === 0)){
            panStart.current = {
                x: e.clientX,
                y: e.clientY,
                scrollX: appState.scrollX,
                scrollY: appState.scrollY,
            };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }
    };

    const onPointerMove = (e: React.PointerEvent) => {
        //更新光标坐标(画布坐标系)
        const p = screenToCanvas({x: e.clientX, y: e.clientY}, appState);
        onAppStateChange({cursor: p});

        if(panStart.current){
            onAppStateChange({
                scrollX: panStart.current.scrollX + (e.clientX - panStart.current.x),
                scrollY: panStart.current.scrollY = (e.clientY - panStart.current.y),
            });
        }
    };

    const onPointerUp = (e: React.PointerEvent) => {
        if(panStart.current){
            panStart.current = null;
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        }
    };

    return (
        <canvas
            ref={canvasRef}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{cursor: isSpaceDown.current ? 'grab' : 'default'}}
        />
    );
}
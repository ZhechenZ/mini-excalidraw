import { useCallback, useEffect, useRef, useState } from "react";
import type { ExcalidrawElement } from "@/element/types";
import type { AppState } from "@/state/appState";
import { MAX_ZOOM, MIN_ZOOM } from "@/constants";
import { screenToCanvas } from "@/utils/viewport";
import { renderScene } from "@/renderer/renderScene";
import { 
    newElementByTool, 
    normalizeElement, 
    mutateElementEnd 
} from "@/element/newElement";

interface CanvasProps {
    elements: ExcalidrawElement[];
    setElements: React.Dispatch<React.SetStateAction<ExcalidrawElement[]>>;
    appState: AppState;
    onAppStateChange: (patch: Partial<AppState>) => void;
}

function toolToCursor(tool: string, isSpaceDown:boolean){
    if(isSpaceDown){
        return 'grab';
    }
    switch(tool){
        case 'selection': return 'default';
        case 'text': return 'text';
        default: return 'crosshair';
    }
}
export function Canvas({
    elements, 
    appState, 
    onAppStateChange,
    setElements,
}: CanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [dpr, setDpr] = useState(window.devicePixelRatio || 1);
    const [isSpaceDown, setIsSpaceDown] = useState(false);
    const panStart = useRef<{
        x:number;
        y:number;
        scrollX:number;
        scrollY:number;   
    } | null>(null);

    //正在绘制临时元素(不进React sstate, 避免每次 move 都触发全量重渲染)
    const draftRef =  useRef<ExcalidrawElement | null>(null);
    //强制触发 canvas 重绘的小tick
    const [tick, setTick] = useState(0);
    const invalidate = useCallback(() => setTick((t) => t + 1), []);
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

    //重新绘制: 把draft拼到elements后面
    useEffect(() => {
        const canvas = canvasRef.current;
        if(!canvas){
            return ;
        }
        const ctx = canvas.getContext('2d');
        if(!ctx){
            return ;
        }
        const draft = draftRef.current;
        const list  = draft ? [...elements, draft] : elements;
        renderScene({canvas, ctx, elements: list, appState, dpr});
    },[elements, appState, dpr, tick]);

    //键盘: 空格 = 平移模式
    useEffect(() => {
        const down = (e:KeyboardEvent) => {
            if(e.code === 'Space'){
                setIsSpaceDown(true);
            }
        }
        const up = (e:KeyboardEvent) => {
            if(e.code === 'Space'){
                setIsSpaceDown(false);
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
        if (e.button === 1 || (isSpaceDown && e.button === 0)){
            panStart.current = {
                x: e.clientX,
                y: e.clientY,
                scrollX: appState.scrollX,
                scrollY: appState.scrollY,
            };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            return ;
        }

        //只处理左键
        if(e.button !== 0) return ;
        const tool = appState.currentTool;
        if(tool === 'selection' || tool === 'freedraw' || tool === 'text') return ;

        const p = screenToCanvas({x: e.clientX, y:e.clientY}, appState);
        draftRef.current = newElementByTool(tool, {x:p.x,y:p.y});
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        invalidate();
    };

    const onPointerMove = (e: React.PointerEvent) => {
        //更新光标坐标(画布坐标系)
        const p = screenToCanvas({x: e.clientX, y: e.clientY}, appState);
        onAppStateChange({cursor: p});

        //平移
        if(panStart.current){
            onAppStateChange({
                scrollX: panStart.current.scrollX + (e.clientX - panStart.current.x),
                scrollY: panStart.current.scrollY + (e.clientY - panStart.current.y),
            });
            return ;
        }

        //拖动绘制中
        if(draftRef.current){
            draftRef.current = mutateElementEnd(draftRef.current, p.x, p.y);
            invalidate();
        }
    };

    const onPointerUp = (e: React.PointerEvent) => {
        //结束平移
        if(panStart.current){
            panStart.current = null;
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            return ;
        }

        //结束绘制
        if(draftRef.current){
            const draft = normalizeElement(draftRef.current);
            draftRef.current = null;
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);

            //太小的元素丢带(点一下不拖动)
            if(Math.abs(draft.width) < 2 && Math.abs(draft.height) < 2){
                invalidate();
                return ;
            }

            setElements(prev => [...prev, draft]);
            //画完自动切回 selection(Excalidraw官方行为)
            onAppStateChange({currentTool: 'selection'});
        }

    };

    const onKeyDownEsc = (e: React.KeyboardEvent) => {
        if(e.key === 'Escape' && draftRef.current){
            draftRef.current = null;
            invalidate();
        }
    }

    return (
        <canvas
            ref={canvasRef}
            tabIndex={0}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onKeyDown={onKeyDownEsc}
            style={{cursor: toolToCursor(appState.currentTool, isSpaceDown)}}
        />
    );
}
//视口坐标转换
import type { CanvasPoint, ScreenPoint, Viewport } from '@/type';
import { MIN_ZOOM, MAX_ZOOM } from '../constants';

//屏幕像素 -> 画布世界坐标
export function screenToCanvas(p: ScreenPoint, vp: Viewport): CanvasPoint{
    return {
        x:(p.x - vp.scrollX) / vp.zoom,
        y:(p.y - vp.scrollY) / vp.zoom,
    };
}

// 画布世界坐标 -> 屏幕像素
export function canvasToScreen(p:CanvasPoint, vp: Viewport): ScreenPoint {
    return {
        x:p.x * vp.zoom + vp.scrollX,
        y:p.y * vp.zoom + vp.scrollY,
    };
}

//以屏幕锚点为中心缩放(e.g.鼠标坐标位置)
export function zoomAt(vp: Viewport, anchor: ScreenPoint, delta:number):Viewport{
    const nextZoom = Math.max(MAX_ZOOM,Math.max(MIN_ZOOM, vp.zoom * (1 + delta )));
    if(nextZoom === vp.zoom) return vp;
    const scale = nextZoom/vp.zoom;
    return {
        zoom:nextZoom,
        scrollX:anchor.x - (anchor.x - vp.scrollX) * scale,
        scrollY:anchor.y - (anchor.y - vp.scrollY) * scale,
    }
}
// 视口坐标转换
import type { AppState } from '@/state/appState';
import { MIN_ZOOM, MAX_ZOOM } from '@/constants';
import type { Bounds } from '@/element/bounds';
// 兼容已有代码：Canvas.tsx 传的是 appState，所以接收 { zoom, scrollX, scrollY } 即可
type Viewport = Pick<AppState, 'zoom' | 'scrollX' | 'scrollY'>;

// 屏幕像素 → 画布世界坐标
export function screenToCanvas(
  p: { x: number; y: number },
  vp: Viewport,
): { x: number; y: number } {
  return {
    x: (p.x - vp.scrollX) / vp.zoom,
    y: (p.y - vp.scrollY) / vp.zoom,
  };
}

// 画布世界坐标 → 屏幕像素
export function canvasToScreen(
  p: { x: number; y: number },
  vp: Viewport,
): { x: number; y: number } {
  return {
    x: p.x * vp.zoom + vp.scrollX,
    y: p.y * vp.zoom + vp.scrollY,
  };
}

// 以屏幕锚点为中心缩放（e.g. 鼠标位置）
// ⚠️ 注意：外层是 Math.min（封顶），内层是 Math.max（兜底）
export function zoomAt(
  vp: Viewport,
  anchor: { x: number; y: number },
  delta: number,
): Viewport {
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.zoom * (1 + delta)));
  if (nextZoom === vp.zoom) return vp;
  const scale = nextZoom / vp.zoom;
  return {
    zoom: nextZoom,
    scrollX: anchor.x - (anchor.x - vp.scrollX) * scale,
    scrollY: anchor.y - (anchor.y - vp.scrollY) * scale,
  };
}

export function getViewportBounds(
  appState: AppState,
  viewportWidth: number,
  viewportHeight: number,
  padding = 100,
): Bounds {
  const tl = screenToCanvas({ x: -padding, y: -padding }, appState);
  const br = screenToCanvas(
    { x: viewportWidth + padding, y: viewportHeight + padding },
    appState,
  );
  return { x1: tl.x, y1: tl.y, x2: br.x, y2: br.y };
}
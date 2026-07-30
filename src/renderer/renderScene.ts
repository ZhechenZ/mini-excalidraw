import rough from 'roughjs';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { ExcalidrawElement } from '@/element/types';
import type { AppState } from '@/state/appState';
import { renderElement } from './renderElement';
import { renderSelection, renderMarquee } from './renderSelection';
import { perfMark, perfMeasure } from '@/utils/perf';

interface BaseParams {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  appState: AppState;
  dpr: number;
}

// 应用视口变换（DPR × zoom × scroll）。抽成函数复用。
function applyViewport(
  ctx: CanvasRenderingContext2D,
  appState: AppState,
  dpr: number,
) {
  ctx.setTransform(
    dpr * appState.zoom,
    0,
    0,
    dpr * appState.zoom,
    appState.scrollX * dpr,
    appState.scrollY * dpr,
  );
}

// 静态层：committed 但当前没被交互的元素。带底色背景。
// 只在 elements 集合发生真实变更时重绘。
export function renderStaticLayer(
  params: BaseParams & { elements: ExcalidrawElement[] },
) {
  const { canvas, ctx, elements, appState, dpr } = params;
  perfMark('static-start');

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  applyViewport(ctx, appState, dpr);
  const rc: RoughCanvas = rough.canvas(canvas);
  for (const el of elements) renderElement(ctx, rc, el);

  perfMark('static-end');
  perfMeasure('renderScene', 'static-start', 'static-end');
}

// 覆盖层：draft、正在拖动/缩放/旋转的元素、选中框、缩放手柄、marquee。
// 透明背景（不 fillRect），叠加在静态层上。每帧重绘。
export function renderOverlayLayer(
  params: BaseParams & {
    interactiveElements: ExcalidrawElement[];
    displaySelected: ExcalidrawElement[];
    marquee: AppState['marquee'];
  },
) {
  const { canvas, ctx, appState, dpr, interactiveElements, displaySelected, marquee } =
    params;
  perfMark('overlay-start');

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  applyViewport(ctx, appState, dpr);
  const rc: RoughCanvas = rough.canvas(canvas);
  for (const el of interactiveElements) renderElement(ctx, rc, el);

  renderSelection(ctx, displaySelected, appState.zoom);
  if (marquee) renderMarquee(ctx, marquee, appState.zoom);

  perfMark('overlay-end');
  perfMeasure('renderScene', 'overlay-start', 'overlay-end');
}

// 兼容旧调用点：保留 renderScene 名字，走静态层逻辑。
// 分层后不再有单层 canvas 场景，但如果外部代码还引用它，不会挂。
export function renderScene(params: BaseParams & { elements: ExcalidrawElement[] }) {
  renderStaticLayer(params);
}
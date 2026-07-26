import rough from 'roughjs';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { ExcalidrawElement } from '@/element/types';
import type { AppState } from '@/state/appState';
import { renderElement } from './renderElement';
import { renderSelection, renderMarquee } from './renderSelection';

interface RenderSceneParams {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  elements: ExcalidrawElement[];
  appState: AppState;
  dpr: number;
}

export function renderScene({ canvas, ctx, elements, appState, dpr }: RenderSceneParams) {
  // 重置变换矩阵，使用物理像素清屏
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 画布背景
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 应用 DPR + 缩放 + 滚动偏移
  ctx.setTransform(
    dpr * appState.zoom,
    0,
    0,
    dpr * appState.zoom,
    appState.scrollX * dpr,
    appState.scrollY * dpr,
  );

  // RoughCanvas 复用同一个 canvas，共享 2D 上下文
  // 上层设置的 transform 矩阵会自动作用于 rough 绘制图形
  const rc: RoughCanvas = rough.canvas(canvas);

  // 批量渲染所有元素（手绘风格图形）
  for (const el of elements) {
    renderElement(ctx, rc, el);
  }

  // 选中框、缩放手柄、框选矩形使用原生绘制，不应用手绘效果
  const selected = elements.filter((el) => appState.selectedElementIds[el.id]);
  renderSelection(ctx, selected, appState.zoom);
  if (appState.marquee) {
    renderMarquee(ctx, appState.marquee, appState.zoom);
  }
}
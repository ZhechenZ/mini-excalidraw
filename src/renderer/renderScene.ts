import type { AppState } from '@/state/appState';
import type { ExcalidrawElement } from '@/element/types';
import { renderElement } from './renderElement';
import { renderSelection, renderMarquee } from './renderSelection';

interface RenderParams {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  elements: ExcalidrawElement[];
  appState: AppState;
  dpr: number;
}

export function renderScene({ canvas, ctx, elements, appState, dpr }: RenderParams) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  ctx.save();
  ctx.setTransform(
    dpr * appState.zoom, 0,
    0, dpr * appState.zoom,
    dpr * appState.scrollX,
    dpr * appState.scrollY,
  );

  // 元素
  for (const el of elements) renderElement(ctx, el);

  // 选中框
  const selected = elements.filter(el => appState.selectedElementIds[el.id]);
  renderSelection(ctx, selected, appState.zoom);

  // 框选矩形
  if (appState.marquee) renderMarquee(ctx, appState.marquee, appState.zoom);

  ctx.restore();
}
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExcalidrawElement } from '@/element/types';
import type { AppState } from '@/state/appState';
import type { Bounds } from '@/element/bounds';
import { MAX_ZOOM, MIN_ZOOM } from '@/constants';
import { screenToCanvas } from '@/utils/viewport';
import { renderScene } from '@/renderer/renderScene';
import { newElementByTool, mutateElementEnd, normalizeElement } from '@/element/newElement';
import { hitTest, hitMarquee } from '@/element/hit';
import { translateElement } from '@/element/mutate';
import { getCommonBounds } from '@/element/bounds';
import {
  getTransformHandles,
  hitTransformHandle,
  handleToCursor,
  type HandleDirection,
} from '@/element/transformHandles';
import { computeNewBounds, resizeElementByBounds } from '@/element/resize';

// ─── 类型 ───
interface CanvasProps {
  elements: ExcalidrawElement[];
  setElements: React.Dispatch<React.SetStateAction<ExcalidrawElement[]>>;
  appState: AppState;
  onAppStateChange: (patch: Partial<AppState>) => void;
  commitHistory: (
    nextElements?: readonly ExcalidrawElement[],
    nextSelected?: Record<string, true>,
  ) => void;
}

const DRAWABLE_TOOLS = ['rectangle', 'ellipse', 'line', 'arrow'] as const;
type DrawableTool = (typeof DRAWABLE_TOOLS)[number];

type Interaction =
  | { type: 'idle' }
  | { type: 'pan';    startX: number; startY: number; scrollX: number; scrollY: number }
  | { type: 'draft';  element: ExcalidrawElement }
  | { type: 'move';   startX: number; startY: number; originals: Record<string, ExcalidrawElement>; hasDragged: boolean }
  | { type: 'marquee'; startX: number; startY: number }
  | { type: 'resize'; handle: HandleDirection; originalBounds: Bounds; originals: Record<string, ExcalidrawElement>; hasDragged: boolean };

function toolToCursor(
  tool: string,
  isSpaceDown: boolean,
  interaction: Interaction,
  hoveredHandle: HandleDirection | null,
) {
  if (interaction.type === 'resize') return handleToCursor(interaction.handle);
  if (interaction.type === 'pan')    return 'grabbing';
  if (hoveredHandle && tool === 'selection' && interaction.type === 'idle') {
    return handleToCursor(hoveredHandle);
  }
  if (isSpaceDown) return 'grab';
  switch (tool) {
    case 'selection': return 'default';
    case 'text':      return 'text';
    default:          return 'crosshair';
  }
}

// ─── 组件 ───
export function Canvas({
  elements,
  setElements,
  appState,
  onAppStateChange,
  commitHistory,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dpr, setDpr] = useState(window.devicePixelRatio || 1);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [hoveredHandle, setHoveredHandle] = useState<HandleDirection | null>(null);
  const interactionRef = useRef<Interaction>({ type: 'idle' });
  const [tick, setTick] = useState(0);
  const invalidate = useCallback(() => setTick(t => t + 1), []);

  // 尺寸
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const d = window.devicePixelRatio || 1;
      setDpr(d);
      canvas.width  = window.innerWidth * d;
      canvas.height = window.innerHeight * d;
      canvas.style.width  = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // 空格
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpaceDown(true); };
    const up   = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpaceDown(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup',   up);
    };
  }, []);

  // 渲染
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const interaction = interactionRef.current;
    let list = elements;
    if (interaction.type === 'draft') list = [...elements, interaction.element];
    renderScene({ canvas, ctx, elements: list, appState, dpr });
  }, [elements, appState, dpr, tick]);

  // 滚轮
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const delta = -e.deltaY * 0.01;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, appState.zoom * (1 + delta)));
      const before = screenToCanvas({ x: e.clientX, y: e.clientY }, appState);
      onAppStateChange({
        zoom: nextZoom,
        scrollX: e.clientX - before.x * nextZoom,
        scrollY: e.clientY - before.y * nextZoom,
      });
    } else {
      onAppStateChange({
        scrollX: appState.scrollX - e.deltaX,
        scrollY: appState.scrollY - e.deltaY,
      });
    }
  };

  // ─ onPointerDown ─
  const onPointerDown = (e: React.PointerEvent) => {
    const p = screenToCanvas({ x: e.clientX, y: e.clientY }, appState);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // ① 平移
    if (e.button === 1 || (isSpaceDown && e.button === 0)) {
      interactionRef.current = {
        type: 'pan',
        startX: e.clientX, startY: e.clientY,
        scrollX: appState.scrollX, scrollY: appState.scrollY,
      };
      invalidate();
      return;
    }
    if (e.button !== 0) return;

    // ② 绘制工具
    const tool = appState.currentTool;
    if (DRAWABLE_TOOLS.includes(tool as DrawableTool)) {
      const el = newElementByTool(tool as DrawableTool, { x: p.x, y: p.y });
      interactionRef.current = { type: 'draft', element: el };
      invalidate();
      return;
    }

    // ③ selection 工具
    if (tool === 'selection') {
      const selected = elements.filter(el => appState.selectedElementIds[el.id]);

      // ③.1 resize 手柄
      if (selected.length > 0) {
        const handles = getTransformHandles(selected, appState.zoom);
        const handle = hitTransformHandle(handles, p.x, p.y, appState.zoom);
        if (handle) {
          const originalBounds = getCommonBounds(selected);
          const originals: Record<string, ExcalidrawElement> = {};
          for (const el of selected) originals[el.id] = el;
          interactionRef.current = { type: 'resize', handle, originalBounds, originals, hasDragged: false };
          invalidate();
          return;
        }
      }

      // ③.2 元素
      const hit = [...elements].reverse().find(el => hitTest(el, p.x, p.y));
      if (hit) {
        let nextIds = { ...appState.selectedElementIds };
        const isSelected = !!nextIds[hit.id];

        if (e.shiftKey) {
          if (isSelected) delete nextIds[hit.id];
          else            nextIds[hit.id] = true;
        } else if (!isSelected) {
          nextIds = { [hit.id]: true };
        }

        onAppStateChange({ selectedElementIds: nextIds });

        const originals: Record<string, ExcalidrawElement> = {};
        for (const el of elements) if (nextIds[el.id]) originals[el.id] = el;
        interactionRef.current = { type: 'move', startX: p.x, startY: p.y, originals, hasDragged: false };
        invalidate();
        return;
      }

      // ③.3 空白 → marquee
      if (!e.shiftKey) onAppStateChange({ selectedElementIds: {} });
      interactionRef.current = { type: 'marquee', startX: p.x, startY: p.y };
      invalidate();
      return;
    }
  };

  // ─ onPointerMove ─
  const onPointerMove = (e: React.PointerEvent) => {
    const p = screenToCanvas({ x: e.clientX, y: e.clientY }, appState);
    onAppStateChange({ cursor: p });
    const interaction = interactionRef.current;

    // hover 手柄
    if (interaction.type === 'idle' && appState.currentTool === 'selection') {
      const selected = elements.filter(el => appState.selectedElementIds[el.id]);
      if (selected.length > 0) {
        const handles = getTransformHandles(selected, appState.zoom);
        setHoveredHandle(hitTransformHandle(handles, p.x, p.y, appState.zoom));
      } else if (hoveredHandle) {
        setHoveredHandle(null);
      }
    }

    if (interaction.type === 'pan') {
      onAppStateChange({
        scrollX: interaction.scrollX + (e.clientX - interaction.startX),
        scrollY: interaction.scrollY + (e.clientY - interaction.startY),
      });
      return;
    }

    if (interaction.type === 'draft') {
      interactionRef.current = {
        ...interaction,
        element: mutateElementEnd(interaction.element, p.x, p.y),
      };
      invalidate();
      return;
    }

    if (interaction.type === 'move') {
      const dx = p.x - interaction.startX;
      const dy = p.y - interaction.startY;
      if (dx !== 0 || dy !== 0) interaction.hasDragged = true;
      setElements(prev => prev.map(el =>
        interaction.originals[el.id]
          ? translateElement(interaction.originals[el.id], dx, dy)
          : el
      ));
      return;
    }

    if (interaction.type === 'marquee') {
      onAppStateChange({
        marquee: {
          x: interaction.startX,
          y: interaction.startY,
          width:  p.x - interaction.startX,
          height: p.y - interaction.startY,
        },
      });
      return;
    }

    if (interaction.type === 'resize') {
      const newBounds = computeNewBounds(
        interaction.handle,
        interaction.originalBounds,
        p.x, p.y,
        e.shiftKey,
      );
      // 是否真的变过
      const ob = interaction.originalBounds;
      if (newBounds.x1 !== ob.x1 || newBounds.y1 !== ob.y1 ||
          newBounds.x2 !== ob.x2 || newBounds.y2 !== ob.y2) {
        interaction.hasDragged = true;
      }
      setElements(prev => prev.map(el =>
        interaction.originals[el.id]
          ? resizeElementByBounds(interaction.originals[el.id], interaction.originalBounds, newBounds)
          : el
      ));
      return;
    }
  };

  // ─ onPointerUp ─
  const onPointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    const interaction = interactionRef.current;
    const p = screenToCanvas({ x: e.clientX, y: e.clientY }, appState);

    if (interaction.type === 'pan') {
      interactionRef.current = { type: 'idle' };
      invalidate();
      return;
    }

    if (interaction.type === 'draft') {
      const draft = normalizeElement(interaction.element);
      interactionRef.current = { type: 'idle' };
      if (Math.abs(draft.width) < 2 && Math.abs(draft.height) < 2) {
        invalidate();
        return;
      }
      const nextElements = [...elements, draft];
      setElements(nextElements);
      onAppStateChange({ currentTool: 'selection' });
      commitHistory(nextElements, appState.selectedElementIds);
      return;
    }

    if (interaction.type === 'move') {
      interactionRef.current = { type: 'idle' };
      if (!interaction.hasDragged) return;   // 单纯点击不写历史
      const dx = p.x - interaction.startX;
      const dy = p.y - interaction.startY;
      const nextElements = elements.map(el =>
        interaction.originals[el.id]
          ? translateElement(interaction.originals[el.id], dx, dy)
          : el
      );
      setElements(nextElements);
      commitHistory(nextElements, appState.selectedElementIds);
      return;
    }

    if (interaction.type === 'marquee') {
      const m = appState.marquee;
      if (m) {
        const nextIds: Record<string, true> = { ...appState.selectedElementIds };
        for (const el of elements) if (hitMarquee(el, m)) nextIds[el.id] = true;
        onAppStateChange({ selectedElementIds: nextIds, marquee: null });
      } else {
        onAppStateChange({ marquee: null });
      }
      interactionRef.current = { type: 'idle' };
      invalidate();
      // 选择变更不写历史
      return;
    }

    if (interaction.type === 'resize') {
      interactionRef.current = { type: 'idle' };
      invalidate();
      if (!interaction.hasDragged) return;
      const newBounds = computeNewBounds(
        interaction.handle,
        interaction.originalBounds,
        p.x, p.y,
        e.shiftKey,
      );
      const nextElements = elements.map(el =>
        interaction.originals[el.id]
          ? resizeElementByBounds(interaction.originals[el.id], interaction.originalBounds, newBounds)
          : el
      );
      setElements(nextElements);
      commitHistory(nextElements, appState.selectedElementIds);
      return;
    }
  };

  // ESC 只处理 draft 中断（其他 ESC 走 App.tsx 全局监听）
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && interactionRef.current.type === 'draft') {
      interactionRef.current = { type: 'idle' };
      invalidate();
    }
  };

  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      style={{
        cursor: toolToCursor(
          appState.currentTool,
          isSpaceDown,
          interactionRef.current,
          hoveredHandle,
        ),
      }}
    />
  );
}
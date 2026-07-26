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
import {
  rotatePoint,
  angleFromPointer,
  snapAngle,
  normalizeAngle,
  setElementAngle,
} from '@/element/rotate';

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
  | { type: 'pan'; startX: number; startY: number; scrollX: number; scrollY: number }
  | { type: 'draft'; element: ExcalidrawElement }
  | {
      type: 'move';
      startX: number;
      startY: number;
      originals: Record<string, ExcalidrawElement>;
      hasDragged: boolean;
    }
  | { type: 'marquee'; startX: number; startY: number }
  | {
      type: 'resize';
      handle: Exclude<HandleDirection, 'rotate'>;
      originalBounds: Bounds;
      originals: Record<string, ExcalidrawElement>;
      startAngle: number;
      startCenter: { cx: number; cy: number };
      hasDragged: boolean;
    }
  // ✅ Day 6：旋转交互
  | {
      type: 'rotate';
      elementId: string;
      original: ExcalidrawElement;
      center: { cx: number; cy: number };
      hasDragged: boolean;
    };

function toolToCursor(
  tool: string,
  isSpaceDown: boolean,
  interaction: Interaction,
  hoveredHandle: HandleDirection | null,
) {
  if (interaction.type === 'resize') return handleToCursor(interaction.handle);
  if (interaction.type === 'rotate') return 'grabbing';
  if (interaction.type === 'pan') return 'grabbing';
  if (hoveredHandle && tool === 'selection' && interaction.type === 'idle') {
    return handleToCursor(hoveredHandle);
  }
  if (isSpaceDown) return 'grab';
  switch (tool) {
    case 'selection':
      return 'default';
    case 'text':
      return 'text';
    default:
      return 'crosshair';
  }
}

/**
 * ✅ Day 6：把画布坐标反向旋转到「单选元素」的本地坐标系。
 * 只有单选且元素有 angle 时才转，否则原样返回。命中检测和 resize 都要走这一步。
 */
function toLocal(
  p: { x: number; y: number },
  selected: ExcalidrawElement[],
): { x: number; y: number } {
  if (selected.length === 1 && selected[0].angle) {
    const el = selected[0];
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    return rotatePoint(p.x, p.y, cx, cy, -el.angle);
  }
  return p;
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
  const invalidate = useCallback(() => setTick((t) => t + 1), []);

  // 尺寸监听
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const d = window.devicePixelRatio || 1;
      setDpr(d);
      canvas.width = window.innerWidth * d;
      canvas.height = window.innerHeight * d;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // 空格拖拽画布
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpaceDown(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // 渲染驱动
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

  // 画布缩放与滚动
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

    // ① 平移画布
    if (e.button === 1 || (isSpaceDown && e.button === 0)) {
      interactionRef.current = {
        type: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
      };
      invalidate();
      return;
    }
    if (e.button !== 0) return;

    // ② 绘制工具
    const tool = appState.currentTool;
    if (DRAWABLE_TOOLS.includes(tool as DrawableTool)) {
      const el = newElementByTool(
        appState.currentTool as DrawableTool,
        {x: p.x, y: p.y},
        { roughness: appState.currentRoughness });
      interactionRef.current = { type: 'draft', element: el };
      invalidate();
      return;
    }

    // ③ selection 选择工具
    if (tool === 'selection') {
      const selected = elements.filter((el) => appState.selectedElementIds[el.id]);

      // ③.1 命中 transform handles（含 rotate handle）
      if (selected.length > 0) {
        const local = toLocal(p, selected); // ✅ Day 6：先转到本地坐标系
        const handles = getTransformHandles(selected, appState.zoom);
        const handle = hitTransformHandle(handles, local.x, local.y, appState.zoom);

        // ✅ Day 6：旋转手柄分支
        if (handle === 'rotate' && selected.length === 1) {
          const el = selected[0];
          interactionRef.current = {
            type: 'rotate',
            elementId: el.id,
            original: el,
            center: { cx: el.x + el.width / 2, cy: el.y + el.height / 2 },
            hasDragged: false,
          };
          invalidate();
          return;
        }

        // 缩放手柄分支
        if (handle && handle !== 'rotate') {
          const originalBounds = getCommonBounds(selected);
          const originals: Record<string, ExcalidrawElement> = {};
          for (const el of selected) originals[el.id] = el;
          const startAngle = selected.length === 1 ? selected[0].angle : 0;
          const startCenter = {
            cx: (originalBounds.x1 + originalBounds.x2) / 2,
            cy: (originalBounds.y1 + originalBounds.y2) / 2,
          };
          interactionRef.current = {
            type: 'resize',
            handle,
            originalBounds,
            originals,
            startAngle,
            startCenter,
            hasDragged: false,
          };
          invalidate();
          return;
        }
      }

      // ③.2 点击选中元素（hitTest 内部已经处理旋转反向计算）
      const hit = [...elements].reverse().find((el) => hitTest(el, p.x, p.y));
      if (hit) {
        let nextIds = { ...appState.selectedElementIds };
        const isSelected = !!nextIds[hit.id];
        if (e.shiftKey) {
          if (isSelected) delete nextIds[hit.id];
          else nextIds[hit.id] = true;
        } else if (!isSelected) {
          nextIds = { [hit.id]: true };
        }
        onAppStateChange({ selectedElementIds: nextIds });
        const originals: Record<string, ExcalidrawElement> = {};
        for (const el of elements) if (nextIds[el.id]) originals[el.id] = el;
        interactionRef.current = {
          type: 'move',
          startX: p.x,
          startY: p.y,
          originals,
          hasDragged: false,
        };
        invalidate();
        return;
      }

      // ③.3 空白处框选
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

    // 悬浮检测手柄
    if (interaction.type === 'idle' && appState.currentTool === 'selection') {
      const selected = elements.filter((el) => appState.selectedElementIds[el.id]);
      if (selected.length > 0) {
        const local = toLocal(p, selected); // ✅ Day 6
        const handles = getTransformHandles(selected, appState.zoom);
        setHoveredHandle(hitTransformHandle(handles, local.x, local.y, appState.zoom));
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
      setElements((prev) =>
        prev.map((el) =>
          interaction.originals[el.id]
            ? translateElement(interaction.originals[el.id], dx, dy)
            : el,
        ),
      );
      return;
    }

    if (interaction.type === 'marquee') {
      onAppStateChange({
        marquee: {
          x: interaction.startX,
          y: interaction.startY,
          width: p.x - interaction.startX,
          height: p.y - interaction.startY,
        },
      });
      return;
    }

    if (interaction.type === 'resize') {
      // ✅ Day 6：把 pointer 反向旋转到本地坐标系（元素带角度时）
      const local = interaction.startAngle
        ? rotatePoint(p.x, p.y, interaction.startCenter.cx, interaction.startCenter.cy, -interaction.startAngle)
        : { x: p.x, y: p.y };

      const newBounds = computeNewBounds(
        interaction.handle,
        interaction.originalBounds,
        local.x,
        local.y,
        e.shiftKey,
      );
      const ob = interaction.originalBounds;
      if (
        newBounds.x1 !== ob.x1 ||
        newBounds.y1 !== ob.y1 ||
        newBounds.x2 !== ob.x2 ||
        newBounds.y2 !== ob.y2
      ) {
        interaction.hasDragged = true;
      }
      setElements((prev) =>
        prev.map((el) =>
          interaction.originals[el.id]
            ? resizeElementByBounds(interaction.originals[el.id], interaction.originalBounds, newBounds)
            : el,
        ),
      );
      return;
    }

    // ✅ Day 6：旋转拖拽实时更新角度
    if (interaction.type === 'rotate') {
      let angle = angleFromPointer(p.x, p.y, interaction.center.cx, interaction.center.cy);
      if (e.shiftKey) angle = snapAngle(angle);
      angle = normalizeAngle(angle);
      if (angle !== interaction.original.angle) interaction.hasDragged = true;
      setElements((prev) =>
        prev.map((el) =>
          el.id === interaction.elementId
            ? setElementAngle(interaction.original, angle)
            : el,
        ),
      );
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
      const nextSelected: Record<string, true> = { [draft.id]: true };
      setElements(nextElements);
      onAppStateChange({ currentTool: 'selection', selectedElementIds: nextSelected });
      commitHistory(nextElements, nextSelected);
      return;
    }

    if (interaction.type === 'move') {
      interactionRef.current = { type: 'idle' };
      if (!interaction.hasDragged) return;
      const dx = p.x - interaction.startX;
      const dy = p.y - interaction.startY;
      const nextElements = elements.map((el) =>
        interaction.originals[el.id]
          ? translateElement(interaction.originals[el.id], dx, dy)
          : el,
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
      return;
    }

    if (interaction.type === 'resize') {
      interactionRef.current = { type: 'idle' };
      invalidate();
      if (!interaction.hasDragged) return;
      const local = interaction.startAngle
        ? rotatePoint(p.x, p.y, interaction.startCenter.cx, interaction.startCenter.cy, -interaction.startAngle)
        : { x: p.x, y: p.y };
      const newBounds = computeNewBounds(
        interaction.handle,
        interaction.originalBounds,
        local.x,
        local.y,
        e.shiftKey,
      );
      const nextElements = elements.map((el) =>
        interaction.originals[el.id]
          ? resizeElementByBounds(interaction.originals[el.id], interaction.originalBounds, newBounds)
          : el,
      );
      setElements(nextElements);
      commitHistory(nextElements, appState.selectedElementIds);
      return;
    }

    // ✅ Day 6：旋转拖拽结束，提交历史
    if (interaction.type === 'rotate') {
      interactionRef.current = { type: 'idle' };
      invalidate();
      if (!interaction.hasDragged) return;
      let angle = angleFromPointer(p.x, p.y, interaction.center.cx, interaction.center.cy);
      if (e.shiftKey) angle = snapAngle(angle);
      angle = normalizeAngle(angle);
      const nextElements = elements.map((el) =>
        el.id === interaction.elementId ? setElementAngle(interaction.original, angle) : el,
      );
      setElements(nextElements);
      commitHistory(nextElements, appState.selectedElementIds);
      return;
    }
  };

  // ESC 中断绘制草稿
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
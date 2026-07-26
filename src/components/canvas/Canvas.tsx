import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExcalidrawElement } from '@/element/types';
import type { AppState } from '@/state/appState';
import { MAX_ZOOM, MIN_ZOOM } from '@/constants';
import { screenToCanvas } from '@/utils/viewport';
import { renderScene } from '@/renderer/renderScene';
import { newElementByTool, mutateElementEnd, normalizeElement } from '@/element/newElement';
import { hitTest, hitMarquee } from '@/element/hit';
import { translateElement } from '@/element/mutate';

// ─── 类型 ───
interface CanvasProps {
  elements: ExcalidrawElement[];
  setElements: React.Dispatch<React.SetStateAction<ExcalidrawElement[]>>;
  appState: AppState;
  onAppStateChange: (patch: Partial<AppState>) => void;
}

const DRAWABLE_TOOLS = ['rectangle', 'ellipse', 'line', 'arrow'] as const;
type DrawableTool = (typeof DRAWABLE_TOOLS)[number];

// 统一交互状态
type Interaction =
  | { type: 'idle' }
  | { type: 'pan'; startX: number; startY: number; scrollX: number; scrollY: number }
  | { type: 'draft'; element: ExcalidrawElement }
  | { type: 'move'; startX: number; startY: number; originals: Record<string, ExcalidrawElement> }
  | { type: 'marquee'; startX: number; startY: number };

function toolToCursor(tool: string, isSpaceDown: boolean, interaction: Interaction) {
  if (interaction.type === 'pan') return 'grabbing';
  if (isSpaceDown) return 'grab';
  switch (tool) {
    case 'selection': return 'default';
    case 'text': return 'text';
    default: return 'crosshair';
  }
}

// ─── 组件 ──
export function Canvas({ elements, setElements, appState, onAppStateChange }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dpr, setDpr] = useState(window.devicePixelRatio || 1);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const interactionRef = useRef<Interaction>({ type: 'idle' });
  const [tick, setTick] = useState(0);
  const invalidate = useCallback(() => setTick(t => t + 1), []);

  // ─ 尺寸 ─
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

  // ─ 空格 ─
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpaceDown(true); };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpaceDown(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // ─ 渲染 ─
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const interaction = interactionRef.current;
    let list = elements;
    if (interaction.type === 'draft') {
      list = [...elements, interaction.element];
    }
    renderScene({ canvas, ctx, elements: list, appState, dpr });
  }, [elements, appState, dpr, tick]);

  // ─ 滚轮 ─
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const delta = -e.deltaY * 0.01;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, appState.zoom * (1 + delta)));
      const before = screenToCanvas({ x: e.clientX, y: e.clientY }, appState);
      onAppStateChange({ zoom: nextZoom, scrollX: e.clientX - before.x * nextZoom, scrollY: e.clientY - before.y * nextZoom });
    } else {
      onAppStateChange({ scrollX: appState.scrollX - e.deltaX, scrollY: appState.scrollY - e.deltaY });
    }
  };

  //onPointerDown：三路分发
  const onPointerDown = (e: React.PointerEvent) => {
    const p = screenToCanvas({ x: e.clientX, y: e.clientY }, appState);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // ① 平移（中键 或 空格+左键）
    if (e.button === 1 || (isSpaceDown && e.button === 0)) {
      interactionRef.current = {
        type: 'pan', startX: e.clientX, startY: e.clientY,
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
      // 从上往下找命中（数组越后面的越"在上面"）
      const hit = [...elements].reverse().find(el => hitTest(el, p.x, p.y));

      if (hit) {
        // 命中了元素 → 选中它 → 进入移动模式
        let nextIds = { ...appState.selectedElementIds };
        const isSelected = !!nextIds[hit.id];

        if (e.shiftKey) {
          // Shift: toggle
          if (isSelected) delete nextIds[hit.id];
          else nextIds[hit.id] = true;
        } else if (!isSelected) {
          // 非 Shift + 没选中过 → 只选中这一个
          nextIds = { [hit.id]: true };
        }
        // 如果已经选中且没有 Shift，保持原选集（方便多选拖动）

        onAppStateChange({ selectedElementIds: nextIds });

        // 快照选中元素的初始位置
        const originals: Record<string, ExcalidrawElement> = {};
        for (const el of elements) {
          if (nextIds[el.id]) originals[el.id] = el;
        }
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = screenToCanvas({ x: e.clientX, y: e.clientY }, appState);
    onAppStateChange({ cursor: p });
    const interaction = interactionRef.current;

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
          width: p.x - interaction.startX,
          height: p.y - interaction.startY,
        },
      });
      return;
    }
  };

  // ═══════════════════════════════════════
  // ★ onPointerUp：收尾
  // ═══════════════════════════════════════
  const onPointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    const interaction = interactionRef.current;

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
      setElements(prev => [...prev, draft]);
      onAppStateChange({ currentTool: 'selection' });
      return;
    }

    if (interaction.type === 'move') {
      interactionRef.current = { type: 'idle' };
      // 元素已经在 move 过程中更新完了，不需要额外操作
      return;
    }

    if (interaction.type === 'marquee') {
      // 计算框选了哪些元素
      const m = appState.marquee;
      if (m) {
        const nextIds: Record<string, true> = { ...appState.selectedElementIds };
        for (const el of elements) {
          if (hitMarquee(el, m)) nextIds[el.id] = true;
        }
        onAppStateChange({ selectedElementIds: nextIds, marquee: null });
      } else {
        onAppStateChange({ marquee: null });
      }
      interactionRef.current = { type: 'idle' };
      invalidate();
      return;
    }
  };

  // ─ ESC ─
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (interactionRef.current.type === 'draft') {
        interactionRef.current = { type: 'idle' };
        invalidate();
      }
      onAppStateChange({ selectedElementIds: {}, marquee: null });
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
      style={{ cursor: toolToCursor(appState.currentTool, isSpaceDown, interactionRef.current) }}
    />
  );
}
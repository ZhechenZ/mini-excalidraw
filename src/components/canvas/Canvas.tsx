import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExcalidrawElement, ExcalidrawTextElement } from '@/element/types';
import type { AppState } from '@/state/appState';
import type { Bounds } from '@/element/bounds';
import { MAX_ZOOM, MIN_ZOOM } from '@/constants';
import { screenToCanvas } from '@/utils/viewport';
import { renderStaticLayer, renderOverlayLayer } from '@/renderer/renderScene';
import {
  newElementByTool, mutateElementEnd, normalizeElement, pushFreedrawPoint,
  newTextElement, mutateText, type DrawableTool,
} from '@/element/newElement';
import { hitTest, hitMarquee } from '@/element/hit';
import { translateElement } from '@/element/mutate';
import { getCommonBounds } from '@/element/bounds';
import {
  getTransformHandles, hitTransformHandle, handleToCursor, type HandleDirection,
} from '@/element/transformHandles';
import { computeNewBounds, resizeElementByBounds } from '@/element/resize';
import { rotatePoint, angleFromPointer, snapAngle, normalizeAngle, setElementAngle } from '@/element/rotate';
import { expandSelectionToGroup } from '@/element/groups';
import { measureText } from '@/renderer/renderElement';
import { TextEditor } from './TextEditor';

interface CanvasProps {
  elements: ExcalidrawElement[];
  setElements: React.Dispatch<React.SetStateAction<ExcalidrawElement[]>>;
  appState: AppState;
  onAppStateChange: (patch: Partial<AppState>) => void;
  commitHistory: (nextElements?: readonly ExcalidrawElement[], nextSelected?: Record<string, true>) => void;
}

const DRAWABLE_TOOLS: readonly DrawableTool[] = ['rectangle', 'ellipse', 'line', 'arrow', 'freedraw'];

// ⭐ Week 1：交互期间不再调用 setElements。
// move/resize/rotate 都把"进行中的偏移量"记在 interactionRef 里，
// 覆盖层根据 originals + 偏移量实时渲染；静态层完全不动。
type Interaction =
  | { type: 'idle' }
  | { type: 'pan'; startX: number; startY: number; scrollX: number; scrollY: number }
  | { type: 'draft'; element: ExcalidrawElement }
  | {
      type: 'move';
      startX: number; startY: number;
      dx: number; dy: number;
      originals: Record<string, ExcalidrawElement>;
      hasDragged: boolean;
    }
  | { type: 'marquee'; startX: number; startY: number }
  | {
      type: 'resize';
      handle: Exclude<HandleDirection, 'rotate'>;
      originalBounds: Bounds;
      newBounds: Bounds;
      originals: Record<string, ExcalidrawElement>;
      startAngle: number;
      startCenter: { cx: number; cy: number };
      hasDragged: boolean;
    }
  | {
      type: 'rotate';
      elementId: string; original: ExcalidrawElement;
      center: { cx: number; cy: number };
      currentAngle: number;
      hasDragged: boolean;
    }
  | { type: 'text-edit'; element: ExcalidrawTextElement; isNew: boolean };

function toolToCursor(tool: string, isSpaceDown: boolean, i: Interaction, h: HandleDirection | null) {
  if (i.type === 'resize') return handleToCursor(i.handle);
  if (i.type === 'rotate' || i.type === 'pan') return 'grabbing';
  if (h && tool === 'selection' && i.type === 'idle') return handleToCursor(h);
  if (isSpaceDown) return 'grab';
  switch (tool) {
    case 'selection': return 'default';
    case 'text': return 'text';
    default: return 'crosshair';
  }
}

function toLocal(p: { x: number; y: number }, selected: ExcalidrawElement[]) {
  if (selected.length === 1 && selected[0].angle) {
    const el = selected[0];
    return rotatePoint(p.x, p.y, el.x + el.width / 2, el.y + el.height / 2, -el.angle);
  }
  return p;
}

// 计算当前正在交互中的元素（应用 dx/dy/newBounds/currentAngle 后的样子）
function computeInteractiveElements(
  elements: ExcalidrawElement[],
  inter: Interaction,
): ExcalidrawElement[] {
  if (inter.type === 'draft') return [inter.element];
  if (inter.type === 'move') {
    return Object.keys(inter.originals).map(id =>
      translateElement(inter.originals[id], inter.dx, inter.dy),
    );
  }
  if (inter.type === 'resize') {
    return Object.keys(inter.originals).map(id =>
      resizeElementByBounds(inter.originals[id], inter.originalBounds, inter.newBounds),
    );
  }
  if (inter.type === 'rotate') {
    return [setElementAngle(inter.original, inter.currentAngle)];
  }
  if (inter.type === 'text-edit' && !inter.isNew) {
    // text-edit 时元素在 TextEditor 里显示，画布上不画
    return [];
  }
  return [];
}

// 返回哪些元素应该被"静态层"排除（因为它们正在被交互）
function getInteractingIds(inter: Interaction): Set<string> {
  const s = new Set<string>();
  if (inter.type === 'move' || inter.type === 'resize') {
    Object.keys(inter.originals).forEach(id => s.add(id));
  } else if (inter.type === 'rotate') {
    s.add(inter.elementId);
  } else if (inter.type === 'text-edit' && !inter.isNew) {
    s.add(inter.element.id);
  }
  return s;
}

export function Canvas({ elements, setElements, appState, onAppStateChange, commitHistory }: CanvasProps) {
  // ⭐ Week 1：两层 canvas
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const [dpr, setDpr] = useState(window.devicePixelRatio || 1);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [hoveredHandle, setHoveredHandle] = useState<HandleDirection | null>(null);
  const interactionRef = useRef<Interaction>({ type: 'idle' });

  // 两个 tick：静态层只在必要时 +1，覆盖层每次交互 +1
  const [overlayTick, setOverlayTick] = useState(0);
  const [staticTick, setStaticTick] = useState(0);
  const invalidateOverlay = useCallback(() => setOverlayTick(t => t + 1), []);
  const invalidateStatic = useCallback(() => setStaticTick(t => t + 1), []);
  const invalidateAll = useCallback(() => {
    setOverlayTick(t => t + 1);
    setStaticTick(t => t + 1);
  }, []);

  // resize 两层 canvas 尺寸
  useEffect(() => {
    const resize = () => {
      const d = window.devicePixelRatio || 1;
      setDpr(d);
      for (const c of [staticCanvasRef.current, overlayCanvasRef.current]) {
        if (!c) continue;
        c.width = window.innerWidth * d;
        c.height = window.innerHeight * d;
        c.style.width = `${window.innerWidth}px`;
        c.style.height = `${window.innerHeight}px`;
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.code === 'Space') setIsSpaceDown(true);
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpaceDown(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // ⭐ 静态层：只画不在交互中的元素。依赖 elements + viewport + staticTick。
  useEffect(() => {
    const canvas = staticCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const interactingIds = getInteractingIds(interactionRef.current);
    const staticEls = interactingIds.size
      ? elements.filter(el => !interactingIds.has(el.id))
      : elements;
    renderStaticLayer({ canvas, ctx, elements: staticEls, appState, dpr });
  }, [elements, appState.zoom, appState.scrollX, appState.scrollY, dpr, staticTick]);

  // ⭐ 覆盖层：画正在交互的元素 + 选中框 + marquee。每 tick 都重画（内容极少）。
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const inter = interactionRef.current;
    const interactive = computeInteractiveElements(elements, inter);
    // 选中框应该跟随交互位置，所以用 static + interactive 合起来算 selected
    const interactingIds = getInteractingIds(inter);
    const staticSelected = elements.filter(
      el => appState.selectedElementIds[el.id] && !interactingIds.has(el.id),
    );
    const displaySelected = [...staticSelected, ...interactive.filter(el => appState.selectedElementIds[el.id])];
    renderOverlayLayer({
      canvas, ctx, appState, dpr,
      interactiveElements: interactive,
      displaySelected,
      marquee: appState.marquee,
    });
  }, [elements, appState, dpr, overlayTick]);

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
      onAppStateChange({ scrollX: appState.scrollX - e.deltaX, scrollY: appState.scrollY - e.deltaY });
    }
  };

  const commitTextEdit = (text: string) => {
    const inter = interactionRef.current;
    if (inter.type !== 'text-edit') return;
    const trimmed = text;
    interactionRef.current = { type: 'idle' };

    if (!trimmed) {
      const next = elements.filter(el => el.id !== inter.element.id);
      setElements(next);
      onAppStateChange({ selectedElementIds: {} });
      commitHistory(next, {});
      invalidateAll();
      return;
    }

    const m = measureText(trimmed, inter.element.fontSize, inter.element.fontFamily);
    const updated = mutateText(inter.element, trimmed, m);
    const nextElements = inter.isNew
      ? [...elements, updated]
      : elements.map(el => el.id === updated.id ? updated : el);
    const nextSel = { [updated.id]: true } as Record<string, true>;
    setElements(nextElements);
    onAppStateChange({ currentTool: 'selection', selectedElementIds: nextSel });
    commitHistory(nextElements, nextSel);
    invalidateAll();
  };

  const cancelTextEdit = () => {
    const inter = interactionRef.current;
    if (inter.type !== 'text-edit') return;
    interactionRef.current = { type: 'idle' };
    if (inter.isNew) return;
    invalidateAll();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (interactionRef.current.type === 'text-edit') return;

    const p = screenToCanvas({ x: e.clientX, y: e.clientY }, appState);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    if (e.button === 1 || (isSpaceDown && e.button === 0)) {
      interactionRef.current = {
        type: 'pan', startX: e.clientX, startY: e.clientY,
        scrollX: appState.scrollX, scrollY: appState.scrollY,
      };
      invalidateOverlay(); return;
    }
    if (e.button !== 0) return;

    const tool = appState.currentTool;

    if (tool === 'text') {
      const el = newTextElement({ x: p.x, y: p.y, strokeColor: '#1e1e1e' });
      interactionRef.current = { type: 'text-edit', element: el, isNew: true };
      invalidateOverlay();
      return;
    }

    if ((DRAWABLE_TOOLS as readonly string[]).includes(tool)) {
      const el = newElementByTool(tool as DrawableTool, { x: p.x, y: p.y }, { roughness: appState.currentRoughness });
      interactionRef.current = { type: 'draft', element: el };
      invalidateOverlay(); return;
    }

    if (tool === 'selection') {
      const selected = elements.filter(el => appState.selectedElementIds[el.id]);

      if (selected.length > 0) {
        const local = toLocal(p, selected);
        const handles = getTransformHandles(selected, appState.zoom);
        const handle = hitTransformHandle(handles, local.x, local.y, appState.zoom);
        if (handle === 'rotate' && selected.length === 1) {
          const el = selected[0];
          interactionRef.current = {
            type: 'rotate', elementId: el.id, original: el,
            center: { cx: el.x + el.width / 2, cy: el.y + el.height / 2 },
            currentAngle: el.angle, hasDragged: false,
          };
          invalidateStatic(); invalidateOverlay(); return;
        }
        if (handle && handle !== 'rotate') {
          const originalBounds = getCommonBounds(selected);
          const originals: Record<string, ExcalidrawElement> = {};
          for (const el of selected) originals[el.id] = el;
          const startAngle = selected.length === 1 ? selected[0].angle : 0;
          const startCenter = { cx: (originalBounds.x1 + originalBounds.x2) / 2, cy: (originalBounds.y1 + originalBounds.y2) / 2 };
          interactionRef.current = {
            type: 'resize', handle, originalBounds, newBounds: originalBounds, originals,
            startAngle, startCenter, hasDragged: false,
          };
          invalidateStatic(); invalidateOverlay(); return;
        }
      }

      const hit = [...elements].reverse().find(el => hitTest(el, p.x, p.y));
      if (hit) {
        const groupExpanded = expandSelectionToGroup(elements, hit.id);
        let nextIds = { ...appState.selectedElementIds };
        const isSelected = !!nextIds[hit.id];
        if (e.shiftKey) {
          if (isSelected) { for (const k of Object.keys(groupExpanded)) delete nextIds[k]; }
          else Object.assign(nextIds, groupExpanded);
        } else if (!isSelected) {
          nextIds = { ...groupExpanded };
        }
        onAppStateChange({ selectedElementIds: nextIds });
        const originals: Record<string, ExcalidrawElement> = {};
        for (const el of elements) if (nextIds[el.id]) originals[el.id] = el;
        interactionRef.current = {
          type: 'move', startX: p.x, startY: p.y, dx: 0, dy: 0,
          originals, hasDragged: false,
        };
        invalidateStatic(); invalidateOverlay(); return;
      }

      if (!e.shiftKey) onAppStateChange({ selectedElementIds: {} });
      interactionRef.current = { type: 'marquee', startX: p.x, startY: p.y };
      invalidateOverlay(); return;
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (appState.currentTool !== 'selection') return;
    if (interactionRef.current.type === 'text-edit') return;
    const p = screenToCanvas({ x: e.clientX, y: e.clientY }, appState);
    const hit = [...elements].reverse().find(el => hitTest(el, p.x, p.y));
    if (hit && hit.type === 'text') {
      interactionRef.current = {
        type: 'text-edit', element: hit as ExcalidrawTextElement, isNew: false,
      };
      onAppStateChange({ selectedElementIds: { [hit.id]: true } });
      invalidateAll();
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = screenToCanvas({ x: e.clientX, y: e.clientY }, appState);
    onAppStateChange({ cursor: p });
    const inter = interactionRef.current;

    if (inter.type === 'idle' && appState.currentTool === 'selection') {
      const selected = elements.filter(el => appState.selectedElementIds[el.id]);
      if (selected.length > 0) {
        const local = toLocal(p, selected);
        const handles = getTransformHandles(selected, appState.zoom);
        setHoveredHandle(hitTransformHandle(handles, local.x, local.y, appState.zoom));
      } else if (hoveredHandle) setHoveredHandle(null);
    }

    if (inter.type === 'pan') {
      onAppStateChange({ scrollX: inter.scrollX + (e.clientX - inter.startX), scrollY: inter.scrollY + (e.clientY - inter.startY) });
      return;
    }
    if (inter.type === 'draft') {
      if (inter.element.type === 'freedraw') {
        const pressure = e.pressure > 0 ? e.pressure : 0.5;
        interactionRef.current = { ...inter, element: pushFreedrawPoint(inter.element, p.x, p.y, pressure) };
      } else {
        interactionRef.current = { ...inter, element: mutateElementEnd(inter.element, p.x, p.y) };
      }
      invalidateOverlay(); return;
    }
    // ⭐ move/resize/rotate 只更新 interactionRef，不 setElements
    if (inter.type === 'move') {
      const dx = p.x - inter.startX, dy = p.y - inter.startY;
      if (dx !== 0 || dy !== 0) inter.hasDragged = true;
      inter.dx = dx; inter.dy = dy;
      invalidateOverlay(); return;
    }
    if (inter.type === 'marquee') {
      onAppStateChange({ marquee: { x: inter.startX, y: inter.startY, width: p.x - inter.startX, height: p.y - inter.startY } });
      return;
    }
    if (inter.type === 'resize') {
      const local = inter.startAngle
        ? rotatePoint(p.x, p.y, inter.startCenter.cx, inter.startCenter.cy, -inter.startAngle)
        : { x: p.x, y: p.y };
      const newBounds = computeNewBounds(inter.handle, inter.originalBounds, local.x, local.y, e.shiftKey);
      const ob = inter.originalBounds;
      if (newBounds.x1 !== ob.x1 || newBounds.y1 !== ob.y1 || newBounds.x2 !== ob.x2 || newBounds.y2 !== ob.y2) inter.hasDragged = true;
      inter.newBounds = newBounds;
      invalidateOverlay(); return;
    }
    if (inter.type === 'rotate') {
      let angle = angleFromPointer(p.x, p.y, inter.center.cx, inter.center.cy);
      if (e.shiftKey) angle = snapAngle(angle);
      angle = normalizeAngle(angle);
      if (angle !== inter.original.angle) inter.hasDragged = true;
      inter.currentAngle = angle;
      invalidateOverlay(); return;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    const inter = interactionRef.current;
    const p = screenToCanvas({ x: e.clientX, y: e.clientY }, appState);

    if (inter.type === 'pan') {
      interactionRef.current = { type: 'idle' };
      invalidateOverlay(); return;
    }
    if (inter.type === 'draft') {
      const draft = normalizeElement(inter.element);
      interactionRef.current = { type: 'idle' };
      if (draft.type === 'freedraw') {
        if (draft.points.length < 2) { invalidateAll(); return; }
      } else if (Math.abs(draft.width) < 2 && Math.abs(draft.height) < 2) { invalidateAll(); return; }
      const nextElements = [...elements, draft];
      const nextSel = { [draft.id]: true } as Record<string, true>;
      setElements(nextElements);
      onAppStateChange({ currentTool: 'selection', selectedElementIds: nextSel });
      commitHistory(nextElements, nextSel);
      return;
    }
    if (inter.type === 'move') {
      const originals = inter.originals;
      const hasDragged = inter.hasDragged;
      const dx = p.x - inter.startX, dy = p.y - inter.startY;
      interactionRef.current = { type: 'idle' };
      if (!hasDragged) { invalidateAll(); return; }
      const nextElements = elements.map(el => originals[el.id] ? translateElement(originals[el.id], dx, dy) : el);
      setElements(nextElements);
      commitHistory(nextElements, appState.selectedElementIds);
      return;
    }
    if (inter.type === 'marquee') {
      const m = appState.marquee;
      if (m) {
        const nextIds: Record<string, true> = { ...appState.selectedElementIds };
        for (const el of elements) if (hitMarquee(el, m)) nextIds[el.id] = true;
        onAppStateChange({ selectedElementIds: nextIds, marquee: null });
      } else onAppStateChange({ marquee: null });
      interactionRef.current = { type: 'idle' };
      invalidateOverlay(); return;
    }
    if (inter.type === 'resize') {
      const originals = inter.originals;
      const originalBounds = inter.originalBounds;
      const startAngle = inter.startAngle;
      const startCenter = inter.startCenter;
      const handle = inter.handle;
      const hasDragged = inter.hasDragged;
      interactionRef.current = { type: 'idle' };
      if (!hasDragged) { invalidateAll(); return; }
      const local = startAngle
        ? rotatePoint(p.x, p.y, startCenter.cx, startCenter.cy, -startAngle)
        : { x: p.x, y: p.y };
      const newBounds = computeNewBounds(handle, originalBounds, local.x, local.y, e.shiftKey);
      const nextElements = elements.map(el => originals[el.id] ? resizeElementByBounds(originals[el.id], originalBounds, newBounds) : el);
      setElements(nextElements);
      commitHistory(nextElements, appState.selectedElementIds);
      return;
    }
    if (inter.type === 'rotate') {
      const original = inter.original;
      const elementId = inter.elementId;
      const center = inter.center;
      const hasDragged = inter.hasDragged;
      interactionRef.current = { type: 'idle' };
      if (!hasDragged) { invalidateAll(); return; }
      let angle = angleFromPointer(p.x, p.y, center.cx, center.cy);
      if (e.shiftKey) angle = snapAngle(angle);
      angle = normalizeAngle(angle);
      const nextElements = elements.map(el => el.id === elementId ? setElementAngle(original, angle) : el);
      setElements(nextElements);
      commitHistory(nextElements, appState.selectedElementIds);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === 'Escape' && interactionRef.current.type !== 'idle') {
      interactionRef.current = { type: 'idle' };
      invalidateAll();
      e.preventDefault();
    }
  };

  const inter = interactionRef.current;
  const cursor = toolToCursor(appState.currentTool, isSpaceDown, inter, hoveredHandle);

  return (
    <div className="canvas-stack" style={{ position: 'fixed', inset: 0 }}>
      <canvas
        ref={staticCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, display: 'block', pointerEvents: 'none' }}
      />
      <canvas
        ref={overlayCanvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        tabIndex={-1}
        style={{ position: 'absolute', top: 0, left: 0, display: 'block', cursor, touchAction: 'none' }}
      />
      {inter.type === 'text-edit' && (
        <TextEditor
          initialText={inter.element.text}
          canvasX={inter.element.x}
          canvasY={inter.element.y}
          fontSize={inter.element.fontSize}
          fontFamily={inter.element.fontFamily}
          color={inter.element.strokeColor}
          zoom={appState.zoom}
          scrollX={appState.scrollX}
          scrollY={appState.scrollY}
          onCommit={commitTextEdit}
          onCancel={cancelTextEdit}
        />
      )}
    </div>
  );
}
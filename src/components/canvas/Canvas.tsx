import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExcalidrawElement, ExcalidrawTextElement } from '@/element/types';
import type { AppState } from '@/state/appState';
import type { Bounds } from '@/element/bounds';
import { MAX_ZOOM, MIN_ZOOM } from '@/constants';
import { screenToCanvas } from '@/utils/viewport';
import { renderScene } from '@/renderer/renderScene';
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

type Interaction =
  | { type: 'idle' }
  | { type: 'pan'; startX: number; startY: number; scrollX: number; scrollY: number }
  | { type: 'draft'; element: ExcalidrawElement }
  | { type: 'move'; startX: number; startY: number; originals: Record<string, ExcalidrawElement>; hasDragged: boolean }
  | { type: 'marquee'; startX: number; startY: number }
  | {
    type: 'resize'; handle: Exclude<HandleDirection, 'rotate'>; originalBounds: Bounds;
    originals: Record<string, ExcalidrawElement>; startAngle: number;
    startCenter: { cx: number; cy: number }; hasDragged: boolean;
  }
  | { type: 'rotate'; elementId: string; original: ExcalidrawElement; center: { cx: number; cy: number }; hasDragged: boolean }
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

export function Canvas({ elements, setElements, appState, onAppStateChange, commitHistory }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dpr, setDpr] = useState(window.devicePixelRatio || 1);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [hoveredHandle, setHoveredHandle] = useState<HandleDirection | null>(null);
  const interactionRef = useRef<Interaction>({ type: 'idle' });
  const [tick, setTick] = useState(0);
  const invalidate = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
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

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // ✅ 编辑 text 时不要触发 Space pan
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.code === 'Space') setIsSpaceDown(true);
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpaceDown(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const inter = interactionRef.current;
    let list = elements;
    if (inter.type === 'draft') list = [...elements, inter.element];
    if (inter.type === 'text-edit' && !inter.isNew) {
      list = elements.filter(el => el.id !== inter.element.id);
    }
    renderScene({ canvas, ctx, elements: list, appState, dpr });
  }, [elements, appState, dpr, tick]);

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
      invalidate();
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
    invalidate();
  };

  const cancelTextEdit = () => {
    const inter = interactionRef.current;
    if (inter.type !== 'text-edit') return;
    interactionRef.current = { type: 'idle' };
    if (inter.isNew) return;
    invalidate();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // 编辑 text 时依赖 textarea 的 onBlur 完成提交，canvas 不参与本次交互
    if (interactionRef.current.type === 'text-edit') return;

    const p = screenToCanvas({ x: e.clientX, y: e.clientY }, appState);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    if (e.button === 1 || (isSpaceDown && e.button === 0)) {
      interactionRef.current = {
        type: 'pan', startX: e.clientX, startY: e.clientY,
        scrollX: appState.scrollX, scrollY: appState.scrollY,
      };
      invalidate(); return;
    }
    if (e.button !== 0) return;

    const tool = appState.currentTool;

    // ✅ Week 2：text 工具点击生成 textarea
    if (tool === 'text') {
      const el = newTextElement({ x: p.x, y: p.y, strokeColor: '#1e1e1e' });
      interactionRef.current = { type: 'text-edit', element: el, isNew: true };
      invalidate();
      return;
    }

    if ((DRAWABLE_TOOLS as readonly string[]).includes(tool)) {
      const el = newElementByTool(tool as DrawableTool, { x: p.x, y: p.y }, { roughness: appState.currentRoughness });
      interactionRef.current = { type: 'draft', element: el };
      invalidate(); return;
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
            center: { cx: el.x + el.width / 2, cy: el.y + el.height / 2 }, hasDragged: false,
          };
          invalidate(); return;
        }
        if (handle && handle !== 'rotate') {
          const originalBounds = getCommonBounds(selected);
          const originals: Record<string, ExcalidrawElement> = {};
          for (const el of selected) originals[el.id] = el;
          const startAngle = selected.length === 1 ? selected[0].angle : 0;
          const startCenter = { cx: (originalBounds.x1 + originalBounds.x2) / 2, cy: (originalBounds.y1 + originalBounds.y2) / 2 };
          interactionRef.current = {
            type: 'resize', handle, originalBounds, originals,
            startAngle, startCenter, hasDragged: false,
          };
          invalidate(); return;
        }
      }

      const hit = [...elements].reverse().find(el => hitTest(el, p.x, p.y));
      if (hit) {
        // ✅ Week 2：group 展开
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
        interactionRef.current = { type: 'move', startX: p.x, startY: p.y, originals, hasDragged: false };
        invalidate(); return;
      }

      if (!e.shiftKey) onAppStateChange({ selectedElementIds: {} });
      interactionRef.current = { type: 'marquee', startX: p.x, startY: p.y };
      invalidate(); return;
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
      invalidate(); return;
    }
    if (inter.type === 'move') {
      const dx = p.x - inter.startX, dy = p.y - inter.startY;
      if (dx !== 0 || dy !== 0) inter.hasDragged = true;
      setElements(prev => prev.map(el => inter.originals[el.id] ? translateElement(inter.originals[el.id], dx, dy) : el));
      return;
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
      setElements(prev => prev.map(el => inter.originals[el.id] ? resizeElementByBounds(inter.originals[el.id], inter.originalBounds, newBounds) : el));
      return;
    }
    if (inter.type === 'rotate') {
      let angle = angleFromPointer(p.x, p.y, inter.center.cx, inter.center.cy);
      if (e.shiftKey) angle = snapAngle(angle);
      angle = normalizeAngle(angle);
      if (angle !== inter.original.angle) inter.hasDragged = true;
      setElements(prev => prev.map(el => el.id === inter.elementId ? setElementAngle(inter.original, angle) : el));
      return;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    const inter = interactionRef.current;
    const p = screenToCanvas({ x: e.clientX, y: e.clientY }, appState);

    if (inter.type === 'pan') { interactionRef.current = { type: 'idle' }; invalidate(); return; }
    if (inter.type === 'draft') {
      const draft = normalizeElement(inter.element);
      interactionRef.current = { type: 'idle' };
      if (draft.type === 'freedraw') {
        if (draft.points.length < 2) { invalidate(); return; }
      } else if (Math.abs(draft.width) < 2 && Math.abs(draft.height) < 2) { invalidate(); return; }
      const nextElements = [...elements, draft];
      const nextSel = { [draft.id]: true } as Record<string, true>;
      setElements(nextElements);
      onAppStateChange({ currentTool: 'selection', selectedElementIds: nextSel });
      commitHistory(nextElements, nextSel);
      return;
    }
    if (inter.type === 'move') {
      interactionRef.current = { type: 'idle' };
      if (!inter.hasDragged) return;
      const dx = p.x - inter.startX, dy = p.y - inter.startY;
      const nextElements = elements.map(el => inter.originals[el.id] ? translateElement(inter.originals[el.id], dx, dy) : el);
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
      invalidate(); return;
    }
    if (inter.type === 'resize') {
      interactionRef.current = { type: 'idle' };
      invalidate();
      if (!inter.hasDragged) return;
      const local = inter.startAngle
        ? rotatePoint(p.x, p.y, inter.startCenter.cx, inter.startCenter.cy, -inter.startAngle)
        : { x: p.x, y: p.y };
      const newBounds = computeNewBounds(inter.handle, inter.originalBounds, local.x, local.y, e.shiftKey);
      const nextElements = elements.map(el => inter.originals[el.id] ? resizeElementByBounds(inter.originals[el.id], inter.originalBounds, newBounds) : el);
      setElements(nextElements);
      commitHistory(nextElements, appState.selectedElementIds);
      return;
    }
    if (inter.type === 'rotate') {
      interactionRef.current = { type: 'idle' };
      invalidate();
      if (!inter.hasDragged) return;
      let angle = angleFromPointer(p.x, p.y, inter.center.cx, inter.center.cy);
      if (e.shiftKey) angle = snapAngle(angle);
      angle = normalizeAngle(angle);
      const nextElements = elements.map(el => el.id === inter.elementId ? setElementAngle(inter.original, angle) : el);
      setElements(nextElements);
      commitHistory(nextElements, appState.selectedElementIds);
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (appState.currentTool !== 'selection') return;
    // 已经在编辑就别重复触发
    if (interactionRef.current.type === 'text-edit') return;
    const p = screenToCanvas({ x: e.clientX, y: e.clientY }, appState);
    const hit = [...elements].reverse().find(el => hitTest(el, p.x, p.y));
    if (hit && hit.type === 'text') {
      // 若刚被 pointerdown 设成了 move，取消掉
      interactionRef.current = {
        type: 'text-edit',
        element: hit as ExcalidrawTextElement,
        isNew: false,
      };
      onAppStateChange({ selectedElementIds: { [hit.id]: true } });
      invalidate();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // ✅ 输入元素放行
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
      return;
    }
    if (e.key === 'Escape' && interactionRef.current.type !== 'idle') {
      interactionRef.current = { type: 'idle' };
      invalidate();
      e.preventDefault();
    }
  };

  const inter = interactionRef.current;
  const cursor = toolToCursor(appState.currentTool, isSpaceDown, inter, hoveredHandle);

  return (
    <>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        tabIndex={-1}
        style={{ display: 'block', cursor, touchAction: 'none' }}
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
    </>
  );
}
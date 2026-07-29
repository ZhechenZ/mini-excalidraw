import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@/components/canvas/Canvas';
import { Toolbar } from '@/components/tool-bar/Toolbar';
import { StatusBar } from '@/components/status-bar/StatusBar';
import { PropertyPanel } from '@/components/tool-bar/PropertyPanel';
import { createInitialAppState, type AppState } from '@/state/appState';
import type { ExcalidrawElement } from '@/element/types';
import { History } from '@/history/History';
import { TOOLS, type Tool } from '@/constants';
import { bringToFront, sendToBack, bringForward, sendBackward } from '@/element/zindex';
import { groupElements, ungroupElements } from '@/element/groups';
import { copyToClipboard, readFromClipboard, preparePastedElements } from '@/element/clipboard';

const TOOL_HOTKEYS: Record<string, Tool> = {
  '1': 'selection', '2': 'rectangle', '3': 'ellipse', '4': 'line',
  '5': 'arrow', '6': 'freedraw', '7': 'text',
  v: 'selection', r: 'rectangle', o: 'ellipse', l: 'line',
  a: 'arrow', p: 'freedraw', t: 'text',
};
const randomInteger = () => Math.floor(Math.random() * 2 ** 31);

export default function App() {
  const [appState, setAppState] = useState<AppState>(createInitialAppState);
  const [elements, setElements] = useState<ExcalidrawElement[]>([]);
  const historyRef = useRef(new History());

  const elementsRef = useRef(elements);
  const selectedIdsRef = useRef(appState.selectedElementIds);
  useEffect(() => { elementsRef.current = elements; }, [elements]);
  useEffect(() => { selectedIdsRef.current = appState.selectedElementIds; }, [appState.selectedElementIds]);
  useEffect(() => { historyRef.current.push([], {}); }, []);

  const patchAppState = (patch: Partial<AppState>) =>
    setAppState(prev => ({ ...prev, ...patch }));

  const commitHistory = (nextElements?: readonly ExcalidrawElement[], nextSelected?: Record<string, true>) => {
    historyRef.current.push(nextElements ?? elementsRef.current, nextSelected ?? selectedIdsRef.current);
  };

  const undo = () => {
    const s = historyRef.current.undo(); if (!s) return;
    setElements([...s.elements]);
    patchAppState({ selectedElementIds: { ...s.selectedElementIds }, marquee: null });
  };
  const redo = () => {
    const s = historyRef.current.redo(); if (!s) return;
    setElements([...s.elements]);
    patchAppState({ selectedElementIds: { ...s.selectedElementIds }, marquee: null });
  };

  const patchSelected = (patch: Partial<ExcalidrawElement>) => {
    const sel = selectedIdsRef.current;
    if (Object.keys(sel).length === 0) return;
    const next = elementsRef.current.map(el =>
      sel[el.id]
        ? ({ ...el, ...patch, version: el.version + 1, versionNonce: randomInteger() } as ExcalidrawElement)
        : el,
    );
    setElements(next);
    commitHistory(next, sel);
  };

  // ✅ Week 2：Z-order / Group / 剪贴板
  const applyZOrder = (fn: (arr: ExcalidrawElement[], ids: Record<string, true>) => ExcalidrawElement[]) => {
    const sel = selectedIdsRef.current;
    if (Object.keys(sel).length === 0) return;
    const next = fn(elementsRef.current, sel);
    setElements(next);
    commitHistory(next, sel);
  };

  const doGroup = () => {
    const sel = selectedIdsRef.current;
    if (Object.keys(sel).length < 2) return;
    const next = groupElements(elementsRef.current, sel);
    setElements(next);
    commitHistory(next, sel);
  };
  const doUngroup = () => {
    const sel = selectedIdsRef.current;
    if (Object.keys(sel).length === 0) return;
    const next = ungroupElements(elementsRef.current, sel);
    setElements(next);
    commitHistory(next, sel);
  };

  const doCopy = () => {
    const sel = selectedIdsRef.current;
    const toCopy = elementsRef.current.filter(el => sel[el.id]);
    if (toCopy.length) void copyToClipboard(toCopy);
  };
  const doPaste = async () => {
    const src = await readFromClipboard();
    if (!src.length) return;
    const pasted = preparePastedElements(src, 20);
    const next = [...elementsRef.current, ...pasted];
    const nextSel: Record<string, true> = {};
    for (const el of pasted) nextSel[el.id] = true;
    setElements(next);
    patchAppState({ selectedElementIds: nextSel });
    commitHistory(next, nextSel);
  };
  const doDuplicate = () => {
    const sel = selectedIdsRef.current;
    const src = elementsRef.current.filter(el => sel[el.id]);
    if (!src.length) return;
    const pasted = preparePastedElements(src, 20);
    const next = [...elementsRef.current, ...pasted];
    const nextSel: Record<string, true> = {};
    for (const el of pasted) nextSel[el.id] = true;
    setElements(next);
    patchAppState({ selectedElementIds: nextSel });
    commitHistory(next, nextSel);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ✅ 输入元素直接放行，避免拦截 textarea / input / contentEditable
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      ) {
        return;
      }

      const meta = e.ctrlKey || e.metaKey;

      if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (meta && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); return; }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = selectedIdsRef.current;
        if (!Object.keys(sel).length) return;
        const next = elementsRef.current.filter(el => !sel[el.id]);
        setElements(next); patchAppState({ selectedElementIds: {} });
        commitHistory(next, {}); return;
      }
      if (e.key === 'Escape') { patchAppState({ selectedElementIds: {}, marquee: null }); return; }

      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const all: Record<string, true> = {};
        for (const el of elementsRef.current) all[el.id] = true;
        patchAppState({ selectedElementIds: all }); return;
      }

      // ✅ Week 2 快捷键
      if (meta && e.key.toLowerCase() === 'c') { e.preventDefault(); doCopy(); return; }
      if (meta && e.key.toLowerCase() === 'v') { e.preventDefault(); void doPaste(); return; }
      if (meta && e.key.toLowerCase() === 'd') { e.preventDefault(); doDuplicate(); return; }
      if (meta && e.key.toLowerCase() === 'g' && !e.shiftKey) { e.preventDefault(); doGroup(); return; }
      if (meta && e.key.toLowerCase() === 'g' &&  e.shiftKey) { e.preventDefault(); doUngroup(); return; }
      if (e.key === ']' &&  meta) { e.preventDefault(); applyZOrder(bringToFront); return; }
      if (e.key === '[' &&  meta) { e.preventDefault(); applyZOrder(sendToBack); return; }
      if (e.key === ']' && !meta) { e.preventDefault(); applyZOrder(bringForward); return; }
      if (e.key === '[' && !meta) { e.preventDefault(); applyZOrder(sendBackward); return; }

      if (!meta && !e.altKey && !e.shiftKey) {
        const t2 = TOOL_HOTKEYS[e.key.toLowerCase()];
        if (t2 && (TOOLS as readonly string[]).includes(t2)) {
          e.preventDefault();
          patchAppState({ currentTool: t2 });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selected = elements.filter(el => appState.selectedElementIds[el.id]);
  return (
    <>
      <Canvas
        elements={elements} setElements={setElements}
        appState={appState} onAppStateChange={patchAppState}
        commitHistory={commitHistory}
      />
      <Toolbar
        currentTool={appState.currentTool}
        onToolChange={t => patchAppState({ currentTool: t })}
        roughness={appState.currentRoughness}
        onRoughnessChange={v => patchAppState({ currentRoughness: v })}
      />
      <PropertyPanel selected={selected} onPatch={patchSelected} />
      <StatusBar cursor={appState.cursor} zoom={appState.zoom} />
    </>
  );
}
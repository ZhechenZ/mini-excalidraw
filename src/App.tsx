import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@/components/canvas/Canvas';
import { Toolbar } from '@/components/tool-bar/Toolbar';
import { StatusBar } from '@/components/status-bar/StatusBar';
import { PropertyPanel } from '@/components/tool-bar/PropertyPanel';
import { createInitialAppState, type AppState } from '@/state/appState';
import type { ExcalidrawElement } from '@/element/types';
import { TOOLS, type Tool } from '@/constants';
import { bringToFront, sendToBack, bringForward, sendBackward } from '@/element/zindex';
import { groupElements, ungroupElements } from '@/element/groups';
import { copyToClipboard, readFromClipboard, preparePastedElements } from '@/element/clipboard';
import { FpsMeter } from './components/dev/FpsMeter';
import { readBenchCount, generateBenchElements } from './utils/bench';
import { AppMenu } from '@/components/menu/AppMenu';
// ⭐ Week 4：CRDT 数据层（Yjs + y-indexeddb）
import { useYSceneDoc } from '@/collab/useYSceneDoc';

// ⭐ Week 4：CRDT 总开关。true = 走 Yjs + y-indexeddb（本周默认）；
// false = 回退到 Week 3 的 useState + useAutosave 降级路径（此文件按 CRDT 模式实现）。
const USE_CRDT = true;

const TOOL_HOTKEYS: Record<string, Tool> = {
  '1': 'selection', '2': 'rectangle', '3': 'ellipse', '4': 'line',
  '5': 'arrow', '6': 'freedraw', '7': 'text',
  v: 'selection', r: 'rectangle', o: 'ellipse', l: 'line',
  a: 'arrow', p: 'freedraw', t: 'text',
};
const randomInteger = () => Math.floor(Math.random() * 2 ** 31);

export default function App() {
  // appState 仍用普通 useState 管理完整交互态（cursor / 选区 / 框选等不进 CRDT）。
  const [appState, setAppState] = useState<AppState>(createInitialAppState);

  // ⭐ Week 4：elements / undo / redo / 落盘全部由 CRDT 层接管。
  // setElements 与 React.Dispatch<SetStateAction> 完全兼容，Canvas 无需任何改动。
  const y = useYSceneDoc({ enabled: USE_CRDT });
  const elements = y.elements;
  const setElements = y.setElements;

  const elementsRef = useRef(elements);
  const selectedIdsRef = useRef(appState.selectedElementIds);
  useEffect(() => { elementsRef.current = elements; }, [elements]);
  useEffect(() => { selectedIdsRef.current = appState.selectedElementIds; }, [appState.selectedElementIds]);

  // ⭐ Week 4：Y.Doc 里 appState 子集变化（加载 / 迁移 / 未来的远端）时，合并回完整 AppState。
  useEffect(() => {
    setAppState(prev => ({ ...prev, ...y.persistedAppState }));
  }, [y.persistedAppState]);

  // patchAppState 现在同时负责：更新本地 UI 态 + 把持久化子集写进 Y.Doc。
  const patchAppState = (patch: Partial<AppState>) => {
    setAppState(prev => ({ ...prev, ...patch }));
    y.updateAppState(patch);
  };

  // ⭐ Week 4：撤销边界 = Y.transact 边界，由 UndoManager 自动管理。
  // commitHistory 保留签名以兼容 Canvas 调用，但不再需要手动提交历史。
  const commitHistory = (
    _nextElements?: readonly ExcalidrawElement[],
    _nextSelected?: Record<string, true>,
  ) => { /* no-op：一次 setElements 的 transact 即为一步撤销 */ };

  const undo = () => {
    y.undo();
    // 撤销后选区可能指向已删元素，清掉更干净（选区不进 CRDT，故直接本地清）。
    setAppState(prev => ({ ...prev, selectedElementIds: {}, marquee: null }));
  };
  const redo = () => {
    y.redo();
    setAppState(prev => ({ ...prev, selectedElementIds: {}, marquee: null }));
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
  };

  const applyZOrder = (fn: (arr: ExcalidrawElement[], ids: Record<string, true>) => ExcalidrawElement[]) => {
    const sel = selectedIdsRef.current;
    if (Object.keys(sel).length === 0) return;
    setElements(fn(elementsRef.current, sel));
  };

  const doGroup = () => {
    const sel = selectedIdsRef.current;
    if (Object.keys(sel).length < 2) return;
    setElements(groupElements(elementsRef.current, sel));
  };
  const doUngroup = () => {
    const sel = selectedIdsRef.current;
    if (Object.keys(sel).length === 0) return;
    setElements(ungroupElements(elementsRef.current, sel));
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
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      const meta = e.ctrlKey || e.metaKey;

      if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (meta && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); return; }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = selectedIdsRef.current;
        if (!Object.keys(sel).length) return;
        const next = elementsRef.current.filter(el => !sel[el.id]);
        setElements(next); patchAppState({ selectedElementIds: {} });
        return;
      }
      if (e.key === 'Escape') { patchAppState({ selectedElementIds: {}, marquee: null }); return; }

      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const all: Record<string, true> = {};
        for (const el of elementsRef.current) all[el.id] = true;
        patchAppState({ selectedElementIds: all }); return;
      }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⭐ Week 4：场景加载改由 useYSceneDoc（whenSynced + 迁移）负责。
  // 这里仅在 CRDT ready 且当前为空时处理 bench 压测数据（?bench=N），不覆盖已有场景。
  useEffect(() => {
    if (!USE_CRDT || !y.ready) return;
    const n = readBenchCount();
    if (n > 0 && elementsRef.current.length === 0) {
      setElements(generateBenchElements(n));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [y.ready]);

  // ⭐ Week 4：从 JSON 导入 —— 写进 Y.Doc（一步事务 = 一步撤销），并同步视口子集。
  const importScene = (file: { elements: ExcalidrawElement[]; appState: Partial<AppState> }) => {
    setElements(file.elements);
    setAppState(prev => ({ ...prev, ...file.appState, selectedElementIds: {}, marquee: null }));
    y.updateAppState(file.appState);
  };
  const clearAll = () => {
    setElements([]);
    setAppState(prev => ({ ...prev, selectedElementIds: {}, marquee: null }));
  };

  const selected = elements.filter(el => appState.selectedElementIds[el.id]);
  return (
    <>
      <Canvas
        elements={elements} setElements={setElements}
        appState={appState} onAppStateChange={patchAppState}
        commitHistory={commitHistory}
      />
      <FpsMeter />
      <AppMenu
        elements={elements}
        appState={appState}
        saveStatus={y.saveStatus}
        onFlush={y.flush}
        onImportScene={importScene}
        onClearScene={clearAll}
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
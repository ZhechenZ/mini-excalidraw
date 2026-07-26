import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@/components/canvas/Canvas';
import { Toolbar } from '@/components/tool-bar/Toolbar';
import { StatusBar } from '@/components/status-bar/StatusBar';
import { createInitialAppState, type AppState } from '@/state/appState';
import type { ExcalidrawElement } from '@/element/types';
import { History } from '@/history/History';

export default function App() {
  const [appState, setAppState] = useState<AppState>(createInitialAppState);
  const [elements, setElements] = useState<ExcalidrawElement[]>([]);
  const historyRef = useRef(new History());

  // 供全局键盘 handler 读到最新值（避免闭包陈旧）
  const elementsRef = useRef(elements);
  const selectedIdsRef = useRef(appState.selectedElementIds);
  useEffect(() => { elementsRef.current = elements; }, [elements]);
  useEffect(() => { selectedIdsRef.current = appState.selectedElementIds; }, [appState.selectedElementIds]);

  // 首次挂载：把"空画布"写入历史，作为最底 undo 状态
  useEffect(() => {
    historyRef.current.push([], {});
  }, []);

  const patchAppState = (patch: Partial<AppState>) =>
    setAppState(prev => ({ ...prev, ...patch }));

  /**
   * 提交一份历史快照
   * - 显式传入 nextElements/nextSelected 时用传入值（推荐，避免 setState 异步 lag）
   * - 不传时读 ref
   */
  const commitHistory = (
    nextElements?: readonly ExcalidrawElement[],
    nextSelected?: Record<string, true>,
  ) => {
    historyRef.current.push(
      nextElements ?? elementsRef.current,
      nextSelected ?? selectedIdsRef.current,
    );
  };

  const undo = () => {
    const snap = historyRef.current.undo();
    if (!snap) return;
    setElements([...snap.elements]);
    patchAppState({ selectedElementIds: { ...snap.selectedElementIds }, marquee: null });
  };

  const redo = () => {
    const snap = historyRef.current.redo();
    if (!snap) return;
    setElements([...snap.elements]);
    patchAppState({ selectedElementIds: { ...snap.selectedElementIds }, marquee: null });
  };

  // 全局键盘：Undo / Redo / Delete / Esc / Cmd+A
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const meta = e.ctrlKey || e.metaKey;

      // Undo
      if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      // Redo（⌘⇧Z 或 Ctrl+Y）
      if (meta && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        redo();
        return;
      }

      // Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const currentSelected = selectedIdsRef.current;
        if (Object.keys(currentSelected).length === 0) return;
        const next = elementsRef.current.filter(el => !currentSelected[el.id]);
        setElements(next);
        patchAppState({ selectedElementIds: {} });
        commitHistory(next, {});
        return;
      }

      // Esc（不写历史，仅清空 UI 状态）
      if (e.key === 'Escape') {
        patchAppState({ selectedElementIds: {}, marquee: null });
        return;
      }

      // Cmd/Ctrl+A（选择变更不写历史，避免噪声）
      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const all: Record<string, true> = {};
        for (const el of elementsRef.current) all[el.id] = true;
        patchAppState({ selectedElementIds: all });
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Canvas
        elements={elements}
        setElements={setElements}
        appState={appState}
        onAppStateChange={patchAppState}
        commitHistory={commitHistory}
      />
      <Toolbar
        currentTool={appState.currentTool}
        onToolChange={(tool) => patchAppState({ currentTool: tool })}
        roughness={appState.currentRoughness}
        onRoughnessChange={(v) => patchAppState({ currentRoughness: v })}
      />
      <StatusBar cursor={appState.cursor} zoom={appState.zoom} />
    </>
  );
}
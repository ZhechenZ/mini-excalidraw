import { useEffect, useState } from 'react';
import { Canvas } from '@/components/canvas/Canvas';
import { Toolbar } from '@/components/tool-bar/Toolbar';
import { StatusBar } from '@/components/status-bar/StatusBar';
import { createInitialAppState, type AppState } from '@/state/appState';
import type { ExcalidrawElement } from '@/element/types';

export default function App() {
  const [appState, setAppState] = useState<AppState>(createInitialAppState);
  const [elements, setElements] = useState<ExcalidrawElement[]>([]);

  const patchAppState = (patch: Partial<AppState>) =>
    setAppState(prev => ({ ...prev, ...patch }));

  // 全局键盘：Delete / Esc / Cmd+A
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        setElements(prev => prev.filter(el => !appState.selectedElementIds[el.id]));
        patchAppState({ selectedElementIds: {} });
      } else if (e.key === 'Escape') {
        patchAppState({ selectedElementIds: {}, marquee: null });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const all: Record<string, true> = {};
        for (const el of elements) all[el.id] = true;
        patchAppState({ selectedElementIds: all });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [elements, appState.selectedElementIds]);

  return (
    <>
      <Canvas
        elements={elements}
        setElements={setElements}
        appState={appState}
        onAppStateChange={patchAppState}
      />
      <Toolbar
        currentTool={appState.currentTool}
        onToolChange={(t) => patchAppState({ currentTool: t })}
      />
      <StatusBar cursor={appState.cursor} zoom={appState.zoom} />
    </>
  );
}
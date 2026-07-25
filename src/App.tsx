import { useState } from "react";
import { Canvas } from "@/components/canvas/Canvas";
import { Toolbar } from "@/components/tool-bar/Toolbar";
import { StatusBar } from "@/components/status-bar/StatusBar";
import { createInitialAppState, type AppState } from '@/state/appState';
import type { ExcalidrawElement } from "@/element/types";

export default function App(){
  const [appState, setAppState] = useState<AppState>(createInitialAppState);
  const [element, setElements] = useState<ExcalidrawElement[]>([]);
  
  const patchAppState = (patch: Partial<AppState>) => {
    return setAppState(prev => ({...prev, ...patch}));
  }
  return (
    <>
      <Canvas
        elements={element}
        appState={appState}
        onAppStateChange={patchAppState}
        setElements={setElements}
      />
      <Toolbar
        currentTool={appState.currentTool}
        onToolChange={(t) => patchAppState({currentTool: t})}
      />
      <StatusBar
        cursor={appState.cursor}
        zoom={appState.zoom}
      />
    </>
  )
}
import { useState } from "react";
import { Canvas } from "@/components/canvas/Canvas";
import { Toolbar } from "@/components/tool-bar/Toolbar";
import { StatusBar } from "@/components/status-bar/StautsBar";
import { createInitialAppState, type AppState } from '@/state/appState';
import type { ExcalidrawElement } from "@/element/type";

export default function App(){
  const [appState, setAppState] = useState<AppState>(createInitialAppState);
  const [element] = useState<ExcalidrawElement[]>([]);
  
  const patchAppState = (patch: Partial<AppState>) => {
    return setAppState(prev => ({...prev, ...patch}));
  }
  return (
    <>
      <Canvas
        elements={element}
        appState={appState}
        onAppStateChange={patchAppState}
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
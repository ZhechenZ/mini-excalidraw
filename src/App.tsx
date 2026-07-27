import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@/components/canvas/Canvas';
import { Toolbar } from '@/components/tool-bar/Toolbar';
import { StatusBar } from '@/components/status-bar/StatusBar';
import { PropertyPanel } from '@/components/tool-bar/PropertyPanel';
import { createInitialAppState, type AppState } from '@/state/appState';
import type { ExcalidrawElement } from '@/element/types';
import { History } from '@/history/History';
import { TOOLS, type Tool } from '@/constants';

// Week 1：工具快捷键（数字键 + 字母键，字母参考 Excalidraw / Figma）
const TOOL_HOTKEYS: Record<string, Tool> = {
    '1': 'selection',
    '2': 'rectangle',
    '3': 'ellipse',
    '4': 'line',
    '5': 'arrow',
    '6': 'freedraw',
    '7': 'text',
    v: 'selection',
    r: 'rectangle',
    o: 'ellipse',
    l: 'line',
    a: 'arrow',
    p: 'freedraw',
    t: 'text',
};

const randomInteger = () => Math.floor(Math.random() * 2 ** 31);

export default function App() {
    const [appState, setAppState] = useState<AppState>(createInitialAppState);
    const [elements, setElements] = useState<ExcalidrawElement[]>([]);
    const historyRef = useRef(new History());

    // 给全局键盘 handler 提供最新值，避免闭包陈旧
    const elementsRef = useRef(elements);
    const selectedIdsRef = useRef(appState.selectedElementIds);
    useEffect(() => { elementsRef.current = elements; }, [elements]);
    useEffect(() => { selectedIdsRef.current = appState.selectedElementIds; }, [appState.selectedElementIds]);

    // 首次挂载：把"空画布"写入历史，作为最底 undo 状态
    useEffect(() => {
        historyRef.current.push([], {});
    }, []);

    const patchAppState = (patch: Partial<AppState>) =>
        setAppState((prev) => ({ ...prev, ...patch }));

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

    /**
     * Week 1：改选中元素的属性（颜色/线宽/填充等）
     * 每次都 bump version + versionNonce，让 History 去重逻辑生效。
     */
    const patchSelected = (patch: Partial<ExcalidrawElement>) => {
        const selectedIds = selectedIdsRef.current;
        if (Object.keys(selectedIds).length === 0) return;
        const next = elementsRef.current.map((el) =>
            selectedIds[el.id]
                ? ({
                      ...el,
                      ...patch,
                      version: el.version + 1,
                      versionNonce: randomInteger(),
                  } as ExcalidrawElement)
                : el,
        );
        setElements(next);
        commitHistory(next, selectedIds);
    };

    // 全局键盘：Undo / Redo / Delete / Esc / Cmd+A / 工具快捷键
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            const meta = e.ctrlKey || e.metaKey;

            if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
                return;
            }
            if (meta && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
                e.preventDefault();
                redo();
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                const currentSelected = selectedIdsRef.current;
                if (Object.keys(currentSelected).length === 0) return;
                const next = elementsRef.current.filter((el) => !currentSelected[el.id]);
                setElements(next);
                patchAppState({ selectedElementIds: {} });
                commitHistory(next, {});
                return;
            }

            if (e.key === 'Escape') {
                patchAppState({ selectedElementIds: {}, marquee: null });
                return;
            }

            if (meta && e.key.toLowerCase() === 'a') {
                e.preventDefault();
                const all: Record<string, true> = {};
                for (const el of elementsRef.current) all[el.id] = true;
                patchAppState({ selectedElementIds: all });
                return;
            }

            // Week 1：工具快捷键
            if (!meta && !e.altKey && !e.shiftKey) {
                const t = TOOL_HOTKEYS[e.key.toLowerCase()];
                if (t && (TOOLS as readonly string[]).includes(t)) {
                    e.preventDefault();
                    patchAppState({ currentTool: t });
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const selected = elements.filter((el) => appState.selectedElementIds[el.id]);

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
            <PropertyPanel selected={selected} onPatch={patchSelected} />
            <StatusBar cursor={appState.cursor} zoom={appState.zoom} />
        </>
    );
}
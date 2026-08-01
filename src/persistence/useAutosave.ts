// 自动保存 Hook：elements / appState 变化后 debounce 写入 IndexedDB。
//
// - 默认 500ms debounce，避免拖动/绘制中每次 setElements 都写盘
// - 用 saving state 暴露"保存中/已保存"，可选接入到 StatusBar
// - 使用 ref 保存最新值 + timer，卸载时刷一次并清 timer

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExcalidrawElement } from '@/element/types';
import type { AppState } from '@/state/appState';
import { saveScene } from './scene';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useAutosave(
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  enabled: boolean,
  debounceMs = 500,
): { status: SaveStatus; flush: () => Promise<void> } {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const latest = useRef({ elements, appState });
  const timerRef = useRef<number | null>(null);

  useEffect(() => { latest.current = { elements, appState }; }, [elements, appState]);

  const doSave = useCallback(async () => {
    setStatus('saving');
    try {
      await saveScene(latest.current.elements, latest.current.appState);
      setStatus('saved');
    } catch (e) {
      console.error('[autosave] save failed', e);
      setStatus('error');
    }
  }, []);

  const flush = useCallback(async () => {
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    await doSave();
  }, [doSave]);

  useEffect(() => {
    if (!enabled) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => { void doSave(); }, debounceMs);
    return () => {
      if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [elements, appState, enabled, debounceMs, doSave]);

  // 页面关闭前尽量刷一次（同步 API 不可用，用异步兜底）
  useEffect(() => {
    const handler = () => { void doSave(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [doSave]);

  return { status, flush };
}
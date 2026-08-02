// Week 4：把 Y.Doc 接进 React 的核心 Hook。
//
// 职责（一并接管了 Week 3 的 useAutosave）：
//   1. 创建 Y.Doc + y-indexeddb provider（落盘由 provider 自动完成）；
//   2. 首屏 whenSynced 后跑一次旧场景迁移，再把 Y 内容灌进 React state；
//   3. 对外暴露一个与 React.Dispatch<SetStateAction> 兼容的 setElements，
//      内部用 Y.transact 做增量 diff（保证 Canvas 无需任何改动）；
//   4. appState 持久化子集的双向同步；
//   5. 基于 Y.UndoManager 的 undo/redo 及其可用态。
//
// 双向绑定防死循环的关键（面试高频）：
//   本地写入前先把"即将写入的签名"记到 lastSigRef；observer 收到自己这次
//   transact 触发的事件时，算出的签名与 lastSigRef 相同 → 直接跳过 setState，
//   于是不会"observer → setState → useEffect → 再 transact"地回环。
//   而远端 / 撤销带来的变更签名不同 → 正常 setState 刷新 UI。

import { useCallback, useEffect, useRef, useState } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import type * as Y from 'yjs';
import type { ExcalidrawElement } from '@/element/types';
import type { AppState } from '@/state/appState';
import type { PersistedAppState } from '@/persistence/scene';
import type { SaveStatus } from '@/persistence/useAutosave';
import {
  createSceneDoc,
  type SceneDoc,
  LOCAL_ORIGIN,
  COLLAB_DB_NAME,
} from './sceneDoc';
import {
  fromYMap,
  applyElementDiff,
  applyAppStateToY,
  readAppStateFromY,
  pickPersistedFromPatch,
} from './elementSync';
import { migrateFromLegacy } from './migrateFromLegacy';
import { YUndoManager } from './yUndoManager';

// 与 React setState 完全一致的 updater 签名，让 setElements 能透明替换 useState。
type ElementsUpdater =
  | ExcalidrawElement[]
  | ((prev: ExcalidrawElement[]) => ExcalidrawElement[]);

export interface UseYSceneDoc {
  ready: boolean;
  // ⭐ Week 5：暴露底层 Y.Doc，供 useYProvider 把同一个 doc 交给 y-webrtc。
  // 这是"业务层零改动接入协同"的关键——provider 与本地落盘共用同一 doc，
  // 谁先谁后 attach 都不影响数据一致性（Yjs 的 update 是幂等可交换的）。
  doc: Y.Doc;
  elements: ExcalidrawElement[];
  // 兼容 React.Dispatch<React.SetStateAction<ExcalidrawElement[]>>，Canvas 直接用。
  setElements: (update: ElementsUpdater) => void;
  // Y 里的 appState 持久化子集（远端/加载/迁移会变化），交给 App 合并进完整 AppState。
  persistedAppState: Partial<PersistedAppState>;
  // 把一次 appState patch 里的持久化字段写进 Y（内部过滤 + 去抖 + transact）。
  updateAppState: (patch: Partial<AppState>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  // 提供给 AppMenu 的落盘状态与手动 flush（y-indexeddb 已自动落盘，这里主要给 UI 反馈）。
  saveStatus: SaveStatus;
  flush: () => Promise<void>;
}

// 元素数组签名：id+version+versionNonce 已能唯一标识每个元素的状态，
// 拼接顺序也一并编码了 z-order，用来做"是否需要 setState"的廉价比较。
function elementsSignature(els: readonly ExcalidrawElement[]): string {
  let s = '';
  for (const el of els) s += `${el.id}:${el.version}:${el.versionNonce}|`;
  return s;
}

export function useYSceneDoc(options: { enabled: boolean }): UseYSceneDoc {
  const { enabled } = options;

  // Y.Doc / provider / UndoManager 全程只创建一次，放 ref 里跨渲染稳定复用。
  const sceneRef = useRef<SceneDoc | null>(null);
  if (sceneRef.current === null) sceneRef.current = createSceneDoc();
  const scene = sceneRef.current;
  const { doc, yElements, yAppState } = scene;

  const undoRef = useRef<YUndoManager | null>(null);
  if (undoRef.current === null) {
    // 只跟踪本地 origin，且每个事务独立成一步撤销。
    undoRef.current = new YUndoManager(yElements, {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 0,
    });
  }
  const undoManager = undoRef.current;

  const [ready, setReady] = useState(false);
  const [elements, setElementsState] = useState<ExcalidrawElement[]>([]);
  const [persistedAppState, setPersistedAppState] = useState<Partial<PersistedAppState>>({});
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  // elementsRef 供函数式 updater 读取"当前值"，避免闭包拿到过期 state。
  const elementsRef = useRef(elements);
  useEffect(() => { elementsRef.current = elements; }, [elements]);

  // 抑制 observer 回环用的签名缓存 + appState 去抖用的挂起补丁/定时器。
  const lastSigRef = useRef<string>('');
  const pendingAppStateRef = useRef<Partial<PersistedAppState>>({});
  const appStateTimerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const providerRef = useRef<IndexeddbPersistence | null>(null);

  // 每次本地写入后给 UI 一个"保存中→已保存"的轻量反馈（真正落盘由 y-indexeddb 负责）。
  const pokeSaved = useCallback(() => {
    setSaveStatus('saving');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => setSaveStatus('saved'), 300);
  }, []);

  // ---- 初始化：provider + whenSynced + 迁移 + 首灌 state + observers ----
  useEffect(() => {
    if (!enabled) return;

    const provider = new IndexeddbPersistence(COLLAB_DB_NAME, doc);
    providerRef.current = provider;

    // 从 Y 全量读回并 setState（带签名抑制，避免与本地写入重复渲染）。
    const syncFromY = () => {
      const arr = yElements.toArray().map(fromYMap);
      const sig = elementsSignature(arr);
      if (sig !== lastSigRef.current) {
        lastSigRef.current = sig;
        setElementsState(arr);
      }
      setPersistedAppState(readAppStateFromY(yAppState));
    };

    // observeDeep：数组增删 + 内部 Y.Map 字段改动都能捕获。
    // 只有非本地 origin（远端/撤销/迁移）才需要在这里刷 React；
    // 本地写入已在 setElements 里同步 setState，靠签名比较自动跳过。
    const onElements = () => syncFromY();
    yElements.observeDeep(onElements);

    const onAppState = () => setPersistedAppState(readAppStateFromY(yAppState));
    yAppState.observe(onAppState);

    // UndoManager 栈变化 → 刷新按钮可用态。
    const offUndo = undoManager.onStackChange(() => {
      setCanUndo(undoManager.canUndo());
      setCanRedo(undoManager.canRedo());
    });

    let disposed = false;
    void provider.whenSynced.then(async () => {
      if (disposed) return;
      // 竞态要点：必须等 whenSynced 之后再迁移/首灌，否则可能把"尚未从 IDB
      // 恢复出来的空 Y.Doc"当成真实空场景，误判甚至覆盖旧数据。
      await migrateFromLegacy(scene);
      syncFromY();
      // 加载 + 迁移都不该成为可撤销步骤，清一次栈。
      undoManager.clear();
      setCanUndo(false);
      setCanRedo(false);
      setSaveStatus('saved');
      setReady(true);
    });

    return () => {
      disposed = true;
      yElements.unobserveDeep(onElements);
      yAppState.unobserve(onAppState);
      offUndo();
      if (appStateTimerRef.current) window.clearTimeout(appStateTimerRef.current);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      // 只销毁本 effect 内创建的 provider；doc / undoManager 由 ref 持有，是“整个组件
      // 生命周期单例”，绝不能在 effect cleanup 里销毁：React.StrictMode（dev）会
      // mount→unmount→mount，若此处 destroy，第二次 mount 会复用已销毁的 doc/UndoManager，
      // 本地事务不再进撤销栈 → Ctrl+Z / Ctrl+Y 永久失效（画布仍可编辑，故极易漏掉）。
      void provider.destroy();
    };
    // 仅依赖 enabled：doc/scene/undoManager 都是 ref 稳定值，只初始化一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // ---- setElements：与 React.Dispatch 兼容的入口 ----
  const setElements = useCallback((update: ElementsUpdater) => {
    const next = typeof update === 'function' ? update(elementsRef.current) : update;
    // 先记签名再写：observer 里算出的签名会与此相同 → 跳过重复 setState。
    lastSigRef.current = elementsSignature(next);
    elementsRef.current = next;
    setElementsState(next); // UI 立即更新，交互手感不受 CRDT 影响
    // 一次事务 = 一步撤销；origin=local 才会被 UndoManager 跟踪。
    doc.transact(() => applyElementDiff(yElements, next), LOCAL_ORIGIN);
    pokeSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- updateAppState：把持久化子集去抖后写进 Y ----
  // UI 层的 appState 已由 App 的 setAppState 同步更新，这里只管"落盘那份"，
  // 去抖是为了避免 pan/zoom 高频事件把 IDB 写爆。
  const updateAppState = useCallback((patch: Partial<AppState>) => {
    const sub = pickPersistedFromPatch(patch);
    if (Object.keys(sub).length === 0) return; // 只有 cursor/选区等非持久化字段，跳过
    Object.assign(pendingAppStateRef.current, sub);
    if (appStateTimerRef.current) window.clearTimeout(appStateTimerRef.current);
    appStateTimerRef.current = window.setTimeout(() => {
      const p = pendingAppStateRef.current;
      pendingAppStateRef.current = {};
      doc.transact(() => applyAppStateToY(yAppState, p), LOCAL_ORIGIN);
      pokeSaved();
    }, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pokeSaved]);

  const undo = useCallback(() => undoManager.undo(), [undoManager]);
  const redo = useCallback(() => undoManager.redo(), [undoManager]);

  // flush：把挂起的 appState 立刻写入，并强制落盘一次，给"立即保存"按钮用。
  const flush = useCallback(async () => {
    if (appStateTimerRef.current) {
      window.clearTimeout(appStateTimerRef.current);
      appStateTimerRef.current = null;
      const p = pendingAppStateRef.current;
      pendingAppStateRef.current = {};
      doc.transact(() => applyAppStateToY(yAppState, p), LOCAL_ORIGIN);
    }
    // 触发 y-indexeddb 立即持久化当前累计的 update。
    await providerRef.current?.set('flush-marker', Date.now());
    setSaveStatus('saved');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ready,
    doc,
    elements,
    setElements,
    persistedAppState,
    updateAppState,
    undo,
    redo,
    canUndo,
    canRedo,
    saveStatus,
    flush,
  };
}
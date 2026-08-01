// 场景持久化：把 elements + AppState 关键字段存到 IndexedDB。
//
// - SCENE_VERSION 用于将来 schema 演进：读取时若版本不符，走迁移或直接丢弃
// - 只保存"可复现视觉"的 AppState 子集，避免持久化交互中间态

import type { ExcalidrawElement } from '@/element/types';
import type { AppState } from '@/state/appState';
import { idbGet, idbSet, idbClear } from './db';

export const SCENE_VERSION = 1;
const SCENE_KEY = 'scene';

// 存到 IDB 的 AppState 子集（视口 + 当前工具 + 粗糙度）
export interface PersistedAppState {
  currentTool: AppState['currentTool'];
  scrollX: number;
  scrollY: number;
  zoom: number;
  currentRoughness: number;
}

export interface PersistedScene {
  version: number;
  updatedAt: number;
  elements: ExcalidrawElement[];
  appState: PersistedAppState;
}

export function pickPersistedAppState(s: AppState): PersistedAppState {
  return {
    currentTool: s.currentTool,
    scrollX: s.scrollX,
    scrollY: s.scrollY,
    zoom: s.zoom,
    currentRoughness: s.currentRoughness,
  };
}

export async function saveScene(
  elements: readonly ExcalidrawElement[],
  appState: AppState,
): Promise<void> {
  const scene: PersistedScene = {
    version: SCENE_VERSION,
    updatedAt: Date.now(),
    elements: [...elements],
    appState: pickPersistedAppState(appState),
  };
  await idbSet(SCENE_KEY, scene);
}

export async function loadScene(): Promise<PersistedScene | null> {
  const s = await idbGet<PersistedScene>(SCENE_KEY);
  if (!s) return null;
  if (s.version !== SCENE_VERSION) {
    // 简单策略：不认识的版本直接丢弃，避免污染主流程
    // 生产项目可以在这里加迁移函数
    console.warn(`[persistence] scene version ${s.version} != ${SCENE_VERSION}, discard`);
    return null;
  }
  return s;
}

export async function clearScene(): Promise<void> {
  await idbClear();
}
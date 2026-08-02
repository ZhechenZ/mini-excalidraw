// Week 6：persistence/scene 单测 —— 本地落盘的读写与版本兜底。
//
// 用 fake-indexeddb 在 node 里提供一个内存版 IndexedDB，无需浏览器即可测
// saveScene / loadScene 往返、版本不符丢弃、以及 pickPersistedAppState 纯逻辑。
// `fake-indexeddb/auto` 必须最先导入，以在 db.ts 惰性 openDB 之前注册全局 indexedDB。

import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  pickPersistedAppState,
  saveScene,
  loadScene,
  clearScene,
  SCENE_VERSION,
} from '@/persistence/scene';
import { idbSet } from '@/persistence/db';
import { createInitialAppState } from '@/state/appState';
import type { ExcalidrawElement } from '@/element/types';

function rect(id: string): ExcalidrawElement {
  return {
    id, type: 'rectangle', x: 0, y: 0, width: 10, height: 10, angle: 0,
    strokeColor: '#000', backgroundColor: 'transparent', strokeWidth: 2,
    roughness: 1, seed: 1, version: 1, versionNonce: 1, groupIds: [],
  } as ExcalidrawElement;
}

describe('pickPersistedAppState', () => {
  it('keeps only the persisted subset', () => {
    const s = createInitialAppState();
    s.zoom = 2; s.scrollX = 30; s.currentTool = 'ellipse';
    expect(pickPersistedAppState(s)).toEqual({
      currentTool: 'ellipse', scrollX: 30, scrollY: 0, zoom: 2, currentRoughness: 1,
    });
  });
});

describe('saveScene / loadScene', () => {
  it('round-trips elements and appState subset', async () => {
    await clearScene();
    const els = [rect('a'), rect('b')];
    const s = createInitialAppState();
    s.zoom = 1.5;
    await saveScene(els, s);
    const loaded = await loadScene();
    expect(loaded?.version).toBe(SCENE_VERSION);
    expect(loaded?.elements.map(e => e.id)).toEqual(['a', 'b']);
    expect(loaded?.appState.zoom).toBe(1.5);
  });

  it('discards scenes with mismatched version', async () => {
    await clearScene();
    // 直接塞一条版本不符的记录（key 与 scene 模块内部一致：'scene'）
    await idbSet('scene', { version: 999, updatedAt: 0, elements: [], appState: {} });
    expect(await loadScene()).toBeNull();
  });

  it('returns null when nothing saved', async () => {
    await clearScene();
    expect(await loadScene()).toBeNull();
  });
});
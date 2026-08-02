// Week 6：collab/elementSync 单测 —— CRDT 双向转换与增量 diff 的核心回归保护。
//
// 覆盖：
//   - toYMap / fromYMap 往返一致；
//   - applyElementDiff 的三类操作：新增、就地改字段、删除；
//   - 未变化时零 delta（同一个 Y.Map 实例被复用，而非重建）；
//   - z-order 重排（Y.Map 无法移动 → 删旧+新建）后顺序正确；
//   - appState 子集 pick / apply / read 的往返。

import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  toYMap,
  fromYMap,
  applyElementDiff,
  pickPersistedFromPatch,
  applyAppStateToY,
  readAppStateFromY,
} from '@/collab/elementSync';
import type { ExcalidrawElement } from '@/element/types';

let seq = 0;
function rect(id: string, patch: Partial<ExcalidrawElement> = {}): ExcalidrawElement {
  return {
    id,
    type: 'rectangle',
    x: 0, y: 0, width: 10, height: 10, angle: 0,
    strokeColor: '#000', backgroundColor: 'transparent',
    strokeWidth: 2, roughness: 1, seed: 1,
    version: 1, versionNonce: ++seq,
    groupIds: [],
    ...patch,
  } as ExcalidrawElement;
}

function apply(yArr: Y.Array<Y.Map<unknown>>, doc: Y.Doc, next: ExcalidrawElement[]) {
  doc.transact(() => applyElementDiff(yArr, next));
}

describe('elementSync toYMap / fromYMap', () => {
  it('round-trips an element (after integration into a doc)', () => {
    // Y.Map 必须先 integrate 进 doc，toJSON 才能读到字段（未 integrate 时为空）。
    const doc = new Y.Doc();
    const yArr = doc.getArray<Y.Map<unknown>>('elements');
    const el = rect('a', { x: 5, y: 7, groupIds: ['g1'] });
    doc.transact(() => yArr.insert(0, [toYMap(el)]));
    expect(fromYMap(yArr.get(0))).toEqual(el);
  });
});

describe('elementSync applyElementDiff', () => {
  it('inserts new elements preserving order', () => {
    const doc = new Y.Doc();
    const yArr = doc.getArray<Y.Map<unknown>>('elements');
    apply(yArr, doc, [rect('a'), rect('b'), rect('c')]);
    expect(yArr.toArray().map(m => m.get('id'))).toEqual(['a', 'b', 'c']);
  });

  it('updates a changed element in place (same Y.Map instance reused)', () => {
    const doc = new Y.Doc();
    const yArr = doc.getArray<Y.Map<unknown>>('elements');
    apply(yArr, doc, [rect('a')]);
    const before = yArr.get(0);
    // 改属性并 bump version
    apply(yArr, doc, [rect('a', { x: 99, version: 2 })]);
    const after = yArr.get(0);
    expect(after).toBe(before); // 复用同一个 Y.Map，不是重建
    expect(after.get('x')).toBe(99);
  });

  it('produces zero delta when nothing changed', () => {
    const doc = new Y.Doc();
    const yArr = doc.getArray<Y.Map<unknown>>('elements');
    const els = [rect('a'), rect('b')];
    apply(yArr, doc, els);
    let updates = 0;
    doc.on('afterTransaction', tr => { if (tr.changed.size > 0) updates++; });
    apply(yArr, doc, els.map(e => ({ ...e }))); // 相同 version/nonce → 视为无变化
    expect(updates).toBe(0);
  });

  it('deletes elements no longer present', () => {
    const doc = new Y.Doc();
    const yArr = doc.getArray<Y.Map<unknown>>('elements');
    apply(yArr, doc, [rect('a'), rect('b'), rect('c')]);
    apply(yArr, doc, [rect('a'), rect('c')]);
    expect(yArr.toArray().map(m => m.get('id'))).toEqual(['a', 'c']);
  });

  it('reorders (z-order) correctly by delete+reinsert', () => {
    const doc = new Y.Doc();
    const yArr = doc.getArray<Y.Map<unknown>>('elements');
    const a = rect('a'), b = rect('b'), c = rect('c');
    apply(yArr, doc, [a, b, c]);
    apply(yArr, doc, [c, a, b]); // 把 c 提到最前
    expect(yArr.toArray().map(m => m.get('id'))).toEqual(['c', 'a', 'b']);
  });
});

describe('elementSync appState subset', () => {
  it('pickPersistedFromPatch keeps only persisted keys', () => {
    const out = pickPersistedFromPatch({
      zoom: 2, scrollX: 10, selectedElementIds: { a: true }, cursor: { x: 1, y: 2 },
    });
    expect(out).toEqual({ zoom: 2, scrollX: 10 });
  });

  it('apply then read round-trips persisted appState', () => {
    const doc = new Y.Doc();
    const yMap = doc.getMap<unknown>('appState');
    doc.transact(() => applyAppStateToY(yMap, { zoom: 3, currentTool: 'rectangle' }));
    expect(readAppStateFromY(yMap)).toEqual({ zoom: 3, currentTool: 'rectangle' });
  });
});
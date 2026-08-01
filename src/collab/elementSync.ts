// Week 4：ExcalidrawElement <-> Y.Map 双向转换 + 高效 diff。
//
// 核心诉求：React 侧每次给的是"全量 elements 数组"，但我们不能每次都清空
// 整个 Y.Array 再重灌（那样会产生巨大的 CRDT delta、破坏协同意图、也拖慢
// y-indexeddb）。所以要按 id 做 key，就地改字段、只插新的、只删没了的。
//
// 这里同时放 appState 子集的读写，因为它同样是"普通对象 <-> Y.Map"的转换，
// 与元素转换是一类事情，收在一个文件里更内聚。

import * as Y from 'yjs';
import type { ExcalidrawElement } from '@/element/types';
import type { AppState } from '@/state/appState';
import type { PersistedAppState } from '@/persistence/scene';
import { PERSISTED_APPSTATE_KEYS } from './sceneDoc';

// Y.Map -> 普通元素对象。Y.Map.toJSON() 会把内部 plain 值（含 points/groupIds
// 这类数组）递归转回普通 JS，正好还原成 ExcalidrawElement。
export function fromYMap(ym: Y.Map<unknown>): ExcalidrawElement {
  return ym.toJSON() as ExcalidrawElement;
}

// 普通元素对象 -> Y.Map。points/groupIds 直接以 plain array 存入：
// 这些结构不需要"点级"协同粒度，存成不可协同的 JSON 值即可，避免引入
// 更多 Y 类型带来的复杂度（KISS，不上 lib0/utility）。
export function toYMap(el: ExcalidrawElement): Y.Map<unknown> {
  const ym = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(el)) {
    ym.set(k, v);
  }
  return ym;
}

// 用 id + version + versionNonce 作为"元素是否变化"的快速判据。
// 项目里任何真实变更都会 bump version/versionNonce（见 History.ts 的去重逻辑），
// 所以这三者相同即可认为无变化，省掉逐字段深比较。
function elementUnchanged(ym: Y.Map<unknown>, el: ExcalidrawElement): boolean {
  return (
    ym.get('id') === el.id &&
    ym.get('version') === el.version &&
    ym.get('versionNonce') === el.versionNonce
  );
}

// 就地覆盖一个 Y.Map 的所有字段（仅在检测到变化时调用）。
// 元素字段很少，整体覆盖的开销可忽略，但避免了逐字段 diff 的复杂度。
function overwriteYMap(ym: Y.Map<unknown>, el: ExcalidrawElement): void {
  for (const [k, v] of Object.entries(el)) {
    ym.set(k, v);
  }
}

/**
 * 把 next 数组"对齐"进 Y.Array，尽量只做增量：
 *   - 已存在且位置正确的元素：变了才就地改字段，没变直接跳过（零 delta）；
 *   - 新元素：在目标位置插入；
 *   - 删除的元素：先整体删掉不在 next 里的 id。
 *
 * 注意：已 integrate 进 doc 的 Y.Map 不能被"移动"到另一个位置（Yjs 限制），
 * 所以 z-order 重排这种场景走"删旧 + 用 toYMap 新建插入"，虽有一次重建，
 * 但常见的"画新图形 / 改属性"仍是纯就地更新，不会整表重写。
 *
 * 必须在 Y.transact(...) 内调用，保证一次 setElements = 一个原子事务 = 一步撤销。
 */
export function applyElementDiff(
  yElements: Y.Array<Y.Map<unknown>>,
  next: readonly ExcalidrawElement[],
): void {
  const nextIds = new Set(next.map(el => el.id));

  // 1) 从后往前删除 next 中已不存在的元素，倒序遍历避免删除后索引错位。
  for (let i = yElements.length - 1; i >= 0; i--) {
    const id = yElements.get(i).get('id') as string;
    if (!nextIds.has(id)) yElements.delete(i, 1);
  }

  // 2) 逐位对齐 next 的顺序。循环不变式：[0, i) 已与 next[0..i) 完全一致。
  for (let i = 0; i < next.length; i++) {
    const el = next[i];
    const cur = i < yElements.length ? yElements.get(i) : undefined;

    if (cur && cur.get('id') === el.id) {
      // 位置正确：仅在变化时就地更新，无变化则完全不写（保持零 delta）。
      if (!elementUnchanged(cur, el)) overwriteYMap(cur, el);
      continue;
    }

    // 位置不对：看看这个 id 是否已存在于后面（说明发生了重排）。
    const foundIdx = indexOfId(yElements, el.id, i);
    if (foundIdx >= 0) {
      // 已存在但位置错了：Y.Map 无法移动，只能删旧 + 新建插入到目标位置。
      yElements.delete(foundIdx, 1);
      yElements.insert(i, [toYMap(el)]);
    } else {
      // 全新元素：直接插到目标位置。
      yElements.insert(i, [toYMap(el)]);
    }
  }
}

// 在 [from, len) 范围内按 id 找 Y.Map 的下标，找不到返回 -1。
function indexOfId(yElements: Y.Array<Y.Map<unknown>>, id: string, from: number): number {
  for (let j = from; j < yElements.length; j++) {
    if (yElements.get(j).get('id') === id) return j;
  }
  return -1;
}

// ---- appState 子集：普通对象 <-> Y.Map ----

// 从任意 AppState / Partial 里挑出需要持久化的字段（其余如 cursor/选区/框选丢弃）。
export function pickPersistedFromPatch(
  patch: Partial<AppState>,
): Partial<PersistedAppState> {
  const out: Partial<PersistedAppState> = {};
  for (const k of PERSISTED_APPSTATE_KEYS) {
    if (patch[k] !== undefined) {
      // 逐键赋值以保持类型精确（避免 as any 的宽松写法）。
      (out as Record<string, unknown>)[k] = patch[k];
    }
  }
  return out;
}

// 把持久化子集写进 Y.Map，仅在值确实变化时 set，避免制造无意义的 delta。
// 必须在 Y.transact(...) 内调用。
export function applyAppStateToY(
  yAppState: Y.Map<unknown>,
  patch: Partial<PersistedAppState>,
): void {
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && yAppState.get(k) !== v) yAppState.set(k, v);
  }
}

// 从 Y.Map 读回持久化子集，交给 React 合并进完整 AppState。
export function readAppStateFromY(yAppState: Y.Map<unknown>): Partial<PersistedAppState> {
  const out: Partial<PersistedAppState> = {};
  for (const k of PERSISTED_APPSTATE_KEYS) {
    const v = yAppState.get(k);
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
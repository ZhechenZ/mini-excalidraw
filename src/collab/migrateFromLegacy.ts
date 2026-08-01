// Week 4：一次性迁移——把 Week 3 手写 IndexedDB 里的旧场景导入 Y.Doc。
//
// 背景：Week 3 用 'mini-excalidraw' 库的 kv store，key='scene' 存整张场景；
// Week 4 改用 y-indexeddb（另一个库）。为了让老用户刷新后数据不丢，需要在
// 首次启动时把旧数据搬进 Y.Doc，并删掉旧 key 避免"两套持久化同时写"的双写问题。
//
// 只做一次：成功后在 Y.Doc 的 _meta 里刻 migratedFromV3=true（这个标记本身
// 也会被 y-indexeddb 落盘），下次启动读到标记就直接跳过。

import { idbGet, idbDel } from '@/persistence/db';
import type { PersistedScene } from '@/persistence/scene';
import type { SceneDoc } from './sceneDoc';
import { MIGRATION_ORIGIN } from './sceneDoc';
import { toYMap, applyAppStateToY } from './elementSync';

const LEGACY_SCENE_KEY = 'scene';
const MIGRATED_FLAG = 'migratedFromV3';

/**
 * 尝试迁移旧场景。返回 true 表示"确实搬进了数据"。
 * 前置：应在 y-indexeddb whenSynced 之后调用，确保此时 Y.Doc 已是最新，
 * 才能可靠判断"Y 里到底有没有内容 / 有没有迁移过"。
 */
export async function migrateFromLegacy(scene: SceneDoc): Promise<boolean> {
  const { doc, yElements, yAppState, yMeta } = scene;

  // 已经迁移过：直接跳过。
  if (yMeta.get(MIGRATED_FLAG) === true) return false;

  // Y 里已经有内容（例如用户在新版本里已经画过）：不覆盖，只补打标记。
  if (yElements.length > 0) {
    doc.transact(() => yMeta.set(MIGRATED_FLAG, true), MIGRATION_ORIGIN);
    return false;
  }

  // 读旧场景。读取或解析失败都不应阻塞应用启动，吞掉异常即可。
  let legacy: PersistedScene | undefined;
  try {
    legacy = await idbGet<PersistedScene>(LEGACY_SCENE_KEY);
  } catch (e) {
    console.warn('[migrate] read legacy scene failed', e);
  }

  // 没有旧数据：也打上标记，避免每次启动都白跑一次 IDB 查询。
  if (!legacy || !legacy.elements || legacy.elements.length === 0) {
    doc.transact(() => yMeta.set(MIGRATED_FLAG, true), MIGRATION_ORIGIN);
    return false;
  }

  // 有旧数据：在一个事务里把 elements + appState 子集灌进 Y.Doc 并打标记。
  // 用 MIGRATION_ORIGIN 而非 LOCAL_ORIGIN，确保这步不会进入 UndoManager 的撤销栈。
  doc.transact(() => {
    for (const el of legacy!.elements) yElements.push([toYMap(el)]);
    if (legacy!.appState) applyAppStateToY(yAppState, legacy!.appState);
    yMeta.set(MIGRATED_FLAG, true);
  }, MIGRATION_ORIGIN);

  // 迁移成功后删除旧 key，彻底避免与 y-indexeddb 双写。
  try {
    await idbDel(LEGACY_SCENE_KEY);
  } catch (e) {
    console.warn('[migrate] delete legacy key failed', e);
  }

  return true;
}
// Week 4：CRDT 场景文档（协同基座 Phase 1）
//
// 这里把整张画布抽象成一个 Y.Doc，未来接 WebSocket/WebRTC provider 时
// 只要把同一个 Y.Doc 交给 provider 即可，业务层（React）完全无感。
//
// 数据布局刻意保持"扁平 + 贴近现有内存结构"，避免过度设计：
//   - elements：Y.Array<Y.Map>  —— 每个图形一个 Y.Map，数组顺序即 z-order
//   - appState：Y.Map           —— 只放"可复现视口"的子集（scroll/zoom/tool/roughness）
//   - _meta   ：Y.Map           —— 存迁移标记等元信息，不参与业务渲染
//
// 为什么用 Y.Array<Y.Map> 而不是 Y.XmlFragment：图形是"扁平的属性包"，
// 没有富文本那种父子/内联嵌套语义；Y.Array<Y.Map> 天然对应 elements[] 数组，
// 按 id diff / 就地改字段都很直接，也不需要额外的 schema 层。

import * as Y from 'yjs';
import type { PersistedAppState } from '@/persistence/scene';

// 本地写入统一打的 origin。UndoManager 只跟踪这个 origin 的事务，
// 同时 observer 靠它区分"自己刚写的" vs "远端/撤销/迁移带来的"变更。
export const LOCAL_ORIGIN = 'local';

// 迁移专用 origin：故意不在 UndoManager 的 trackedOrigins 里，
// 避免"导入旧场景"这一步被算成一次可撤销操作。
export const MIGRATION_ORIGIN = 'migration';

// y-indexeddb 的库名。与 Week 3 手写 KV 用的 'mini-excalidraw' 区分开，
// 这样两套持久化互不干扰，降级模式也能各自独立读写。
export const COLLAB_DB_NAME = 'mini-excalidraw-collab';

// Y.Doc 里 appState 只持久化这几个字段，和 Week 3 的 PersistedAppState 完全对齐，
// 保证 CRDT 模式和降级模式落盘的语义一致。
export const PERSISTED_APPSTATE_KEYS = [
  'currentTool',
  'scrollX',
  'scrollY',
  'zoom',
  'currentRoughness',
] as const satisfies readonly (keyof PersistedAppState)[];

// 一个已初始化好各顶层类型的 Y.Doc 视图，方便到处传递而不用重复 getXxx。
export interface SceneDoc {
  doc: Y.Doc;
  yElements: Y.Array<Y.Map<unknown>>;
  yAppState: Y.Map<unknown>;
  yMeta: Y.Map<unknown>;
}

// 顶层类型必须用同名 getArray/getMap 获取（Yjs 用名字做根键），
// 这里集中一次，避免各处字符串写错导致读到不同的根。
export function createSceneDoc(): SceneDoc {
  const doc = new Y.Doc();
  return {
    doc,
    yElements: doc.getArray<Y.Map<unknown>>('elements'),
    yAppState: doc.getMap<unknown>('appState'),
    yMeta: doc.getMap<unknown>('_meta'),
  };
}
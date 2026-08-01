// Week 4：用 Y.UndoManager 替代 Week 1~3 的手写 History 类。
//
// 为什么换：一旦进入协同（Week 5），"撤销"必须是"只撤销我自己的操作"，
// 手写的全量快照栈无法区分本地/远端修改，且和 CRDT 的合并语义冲突。
// Y.UndoManager 原生支持"按 origin 过滤要跟踪的变更"，正是我们需要的。
//
// 两个关键点（面试常问）：
//   - trackedOrigins：只跟踪本地事务（LOCAL_ORIGIN）。远端 / 迁移 / 初始加载
//     带来的变更不会进撤销栈，天然实现"只撤销自己的操作"。
//   - captureTimeout：把"多长时间内的连续事务合并成一步"。这里设为 0，
//     让每个 Y.transact 独立成为一步撤销，语义等价于旧的 commitHistory
//     （画两个图形 → 两次撤销），避免快速连续操作被误并成一步。

import * as Y from 'yjs';

export interface YUndoManagerOptions {
  // 只跟踪这些 origin 的事务。默认只有本地。
  trackedOrigins?: Set<unknown>;
  // 连续事务合并窗口（ms）。0 = 每个事务独立成步。
  captureTimeout?: number;
}

/**
 * 对 Y.UndoManager 的薄封装：对外暴露 undo/redo/canUndo/canRedo，
 * 并允许订阅栈变化（用于驱动 React 的按钮可用态）。
 */
export class YUndoManager {
  private readonly um: Y.UndoManager;

  constructor(
    // 可跟踪单个或多个 Y 类型（这里通常只传 yElements）。
    // 用 any 宽松声明：Y.Array<Y.Map> 的事件类型与 AbstractType<unknown> 存在
    // 协变不兼容，这里不关心具体事件类型，交给 Y.UndoManager 内部处理。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeScope: Y.AbstractType<any> | Y.AbstractType<any>[],
    options: YUndoManagerOptions = {},
  ) {
    this.um = new Y.UndoManager(typeScope, {
      trackedOrigins: options.trackedOrigins ?? new Set(),
      captureTimeout: options.captureTimeout ?? 0,
    });
  }

  undo(): void {
    this.um.undo();
  }

  redo(): void {
    this.um.redo();
  }

  canUndo(): boolean {
    return this.um.canUndo();
  }

  canRedo(): boolean {
    return this.um.canRedo();
  }

  // 订阅撤销栈的增删（stack-item-added / stack-item-popped），
  // 返回取消订阅函数，方便在 React useEffect 里清理。
  onStackChange(cb: () => void): () => void {
    this.um.on('stack-item-added', cb);
    this.um.on('stack-item-popped', cb);
    return () => {
      this.um.off('stack-item-added', cb);
      this.um.off('stack-item-popped', cb);
    };
  }

  // 清空撤销栈：用于"初始加载 / 迁移完成后"，避免把加载动作本身留成可撤销步骤。
  clear(): void {
    this.um.clear();
  }

  destroy(): void {
    this.um.destroy();
  }
}
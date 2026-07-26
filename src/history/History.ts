import type { ExcalidrawElement } from '@/element/types';

export interface HistorySnapshot {
  elements: readonly ExcalidrawElement[];
  selectedElementIds: Readonly<Record<string, true>>;
}

const MAX_HISTORY = 100;

/**
 * 简易历史栈：cursor 指向当前状态，push 会丢弃 cursor 之后的 redo 分支
 */
export class History {
  private stack: HistorySnapshot[] = [];
  private cursor = -1;

  push(elements: readonly ExcalidrawElement[], selectedElementIds: Record<string, true>) {
    const snap: HistorySnapshot = {
      elements: [...elements],
      selectedElementIds: { ...selectedElementIds },
    };

    // 与栈顶去重（version + versionNonce 已能唯一标识元素状态）
    const top = this.stack[this.cursor];
    if (top && sameSnapshot(top, snap)) return;

    // 丢弃 cursor 之后的 redo 分支
    this.stack = this.stack.slice(0, this.cursor + 1);
    this.stack.push(snap);

    // 限长
    if (this.stack.length > MAX_HISTORY) {
      this.stack.shift();
    } else {
      this.cursor++;
    }
  }

  canUndo() { return this.cursor > 0; }
  canRedo() { return this.cursor < this.stack.length - 1; }

  undo(): HistorySnapshot | null {
    if (!this.canUndo()) return null;
    this.cursor--;
    return this.stack[this.cursor];
  }

  redo(): HistorySnapshot | null {
    if (!this.canRedo()) return null;
    this.cursor++;
    return this.stack[this.cursor];
  }

  clear() {
    this.stack = [];
    this.cursor = -1;
  }
}

function sameSnapshot(a: HistorySnapshot, b: HistorySnapshot): boolean {
  if (a.elements.length !== b.elements.length) return false;
  for (let i = 0; i < a.elements.length; i++) {
    const x = a.elements[i];
    const y = b.elements[i];
    if (x.id !== y.id || x.version !== y.version || x.versionNonce !== y.versionNonce) {
      return false;
    }
  }
  const aKeys = Object.keys(a.selectedElementIds);
  const bKeys = Object.keys(b.selectedElementIds);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) if (!b.selectedElementIds[k]) return false;
  return true;
}
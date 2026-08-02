// Week 5：Awareness（在线状态）封装。
//
// Awareness 是 Yjs 生态里专门存"非持久、易失"状态的通道：光标位置、选中集合、
// 用户名/颜色、在线心跳等。它和文档数据（Y.Doc）分开传输——不进 CRDT、不落盘、
// 断开即自动过期（默认 30s 无更新即清除），非常适合"谁在线 + 光标在哪"这类信息。
//
// 本文件把 Awareness 的命令式 API 包成一个 React Hook：
//   - 进房时给自己分配一个稳定的「访客-XX + 颜色」身份，写进 awareness 的 user 字段；
//   - 对外暴露 setPointer / setSelectedIds 两个写入口（pointer 高频，做节流）；
//   - 订阅 'change' 事件，把远端所有 peer 的状态整理成数组给 UI 渲染。
//
// 设计取舍：本地状态不放进 React（避免自己动一下就 re-render 全家），只把"远端
// 快照"作为 state；本地写入直接打到 awareness，节流后广播。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';

export interface RemoteUser {
  name: string;
  color: string;
}

// 单个 peer 的完整 awareness 状态。字段都可选，远端可能只广播了一部分。
export interface AwarenessState {
  user?: RemoteUser;
  pointer?: { x: number; y: number } | null;
  selectedIds?: string[];
}

// 交给 UI 渲染的远端在线用户（带 clientId 便于 React key）。
export interface RemotePresence extends AwarenessState {
  clientId: number;
}

export interface UseAwareness {
  localUser: RemoteUser;
  remoteStates: RemotePresence[];
  setPointer: (p: { x: number; y: number } | null) => void;
  setSelectedIds: (ids: string[]) => void;
}

// 高区分度的一组颜色（避免相邻色系难以分辨）。
const USER_COLORS = [
  '#e03131', '#1971c2', '#2f9e44', '#f08c00',
  '#7048e8', '#e64980', '#0c8599', '#f76707',
];

// 生成一个随机访客身份。抽成纯函数便于 Week 6 单测（断言颜色在色板内、名字前缀）。
export function randomUser(): RemoteUser {
  const n = Math.floor(Math.random() * 90) + 10; // 10~99，稳定两位数更好看
  const color = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
  return { name: `访客-${n}`, color };
}

// pointer 节流间隔：pointermove 每秒可达上百次，全量广播会打爆信令/带宽。
// 50ms（~20fps）对光标平滑度足够，又能把广播量压到可接受范围。
const POINTER_THROTTLE_MS = 50;

export function useAwareness(
  awareness: Awareness | null,
  options: { readOnly?: boolean } = {},
): UseAwareness {
  const { readOnly = false } = options;

  // 本地身份整个会话稳定，用 ref 持有；换房间（awareness 变）时重新写入同一身份。
  const localUserRef = useRef<RemoteUser | null>(null);
  if (localUserRef.current === null) localUserRef.current = randomUser();
  const localUser = localUserRef.current;

  const [remoteStates, setRemoteStates] = useState<RemotePresence[]>([]);
  const lastPointerTsRef = useRef(0);

  useEffect(() => {
    if (!awareness) {
      setRemoteStates([]);
      return;
    }

    // 进房先声明自己是谁。只读用户也广播身份，这样别人能看到"有观众在看"。
    awareness.setLocalStateField('user', localUser);

    // 把 awareness.getStates()（Map<clientId, state>）整理成"排除自己"的数组。
    const sync = () => {
      const out: RemotePresence[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return; // 跳过自己
        out.push({ clientId, ...(state as AwarenessState) });
      });
      setRemoteStates(out);
    };

    sync();
    awareness.on('change', sync);
    return () => {
      awareness.off('change', sync);
    };
    // localUser 是稳定 ref 值；只需在 awareness 实例变化时重新绑定。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awareness]);

  const setPointer = useCallback(
    (p: { x: number; y: number } | null) => {
      if (!awareness) return;
      // 清空（离开画布）立即广播；移动则节流。
      if (p === null) {
        awareness.setLocalStateField('pointer', null);
        return;
      }
      const now = performance.now();
      if (now - lastPointerTsRef.current < POINTER_THROTTLE_MS) return;
      lastPointerTsRef.current = now;
      awareness.setLocalStateField('pointer', p);
    },
    [awareness],
  );

  const setSelectedIds = useCallback(
    (ids: string[]) => {
      if (!awareness) return;
      // 只读用户不广播选中集（它本就不能选/改，避免污染他人视图）。
      if (readOnly) return;
      awareness.setLocalStateField('selectedIds', ids);
    },
    [awareness, readOnly],
  );

  return { localUser, remoteStates, setPointer, setSelectedIds };
}
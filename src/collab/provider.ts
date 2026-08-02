// Week 5：y-webrtc Provider 封装。
//
// 把同一个 Y.Doc（Week 4 已建好的 CRDT 场景）交给 y-webrtc，即可获得
// 零后端的实时协同——y-webrtc 用公共信令服务器（默认 wss://y-webrtc-eu.fly.dev）
// 交换 WebRTC 握手信息，真正的文档 update 与 awareness 走浏览器之间的 P2P
// 通道，不经过任何业务服务器。业务层（React / Canvas）对"数据从哪来"完全无感，
// 这正是 Week 4 把数据模型迁到 Yjs 的核心收益。
//
// 只读模式（mode=view）也在这里落地：只读时不广播本地 awareness 更新之外，
// provider 仍需连上房间以"接收"远端变更，所以只读的编辑禁用放在 App 层做
// （setElements 变 no-op），provider 本身照常连接。
//
// ⚠️ 生命周期：provider 与 roomId 强绑定，roomId 变化（切换房间）时必须销毁
// 旧 provider 再建新的，否则会同时挂在两个信令频道上。doc 由 useYSceneDoc
// 持有、绝不在这里销毁——provider.destroy() 只断开网络，不动本地 doc/落盘。

import { useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import type { Awareness } from 'y-protocols/awareness';

// 可扩展成 y-websocket：把这里换成 WebsocketProvider(url, roomId, doc)
// 即可，awareness 同样从 provider.awareness 取，上层代码零改动。
export interface UseYProviderOptions {
  enabled?: boolean;
  // 自定义信令服务器列表。生产环境建议自建，公共服务器仅用于演示/免部署。
  signaling?: string[];
  // 房间口令：设置后，同口令的 peer 才能解密彼此的数据（端到端加密）。
  password?: string | null;
}

export interface UseYProvider {
  provider: WebrtcProvider | null;
  awareness: Awareness | null;
  // 是否已通过信令服务器连上（至少一个 peer 或信令 open）。用于 UI 状态点。
  connected: boolean;
}

export function useYProvider(
  doc: Y.Doc | null,
  roomId: string | null,
  options: UseYProviderOptions = {},
): UseYProvider {
  const { enabled = true, signaling, password = null } = options;

  const providerRef = useRef<WebrtcProvider | null>(null);
  const [provider, setProvider] = useState<WebrtcProvider | null>(null);
  const [awareness, setAwareness] = useState<Awareness | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // 没有 doc / 没有房间 / 未启用：不建连接（单机模式）。
    if (!doc || !roomId || !enabled) {
      setProvider(null);
      setAwareness(null);
      setConnected(false);
      return;
    }

    // y-webrtc 房间名用 roomId；信令默认公共服务器，可通过 options 覆盖。
    const p = new WebrtcProvider(roomId, doc, {
      signaling: signaling ?? ['wss://y-webrtc-eu.fly.dev'],
      password: password ?? undefined,
      // 单房间成员上限：y-webrtc 是全连接 P2P（N 人两两建 N² 连接），
      // 成员越多开销越大，官方推荐 ~10~20，这里给一个带抖动的上限避免抖动同刷。
      maxConns: 20 + Math.floor(Math.random() * 15),
      // 同一浏览器多标签页会先走 BroadcastChannel 直连，减少 WebRTC 连接数。
      filterBcConns: true,
      peerOpts: {},
    });

    providerRef.current = p;
    setProvider(p);
    setAwareness(p.awareness);

    // 'status' 事件在信令连接建立/断开时触发；'peers' 在 P2P 连接增减时触发。
    const onStatus = (e: { connected: boolean }) => setConnected(e.connected);
    const onPeers = () => setConnected(p.connected || (p.room?.webrtcConns.size ?? 0) > 0);
    p.on('status', onStatus);
    p.on('peers', onPeers);

    return () => {
      p.off('status', onStatus);
      p.off('peers', onPeers);
      // 只断网络，不销毁 doc：doc 是 useYSceneDoc 的单例，销毁会连带毁掉本地落盘链路。
      p.destroy();
      if (providerRef.current === p) providerRef.current = null;
    };
    // roomId / enabled / doc 变化时重建 provider；signaling/password 视为稳定配置。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, roomId, enabled]);

  return { provider, awareness, connected };
}
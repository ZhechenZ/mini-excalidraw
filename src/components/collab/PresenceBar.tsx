// Week 5：右上角在线用户列表（Presence Bar）。
//
// 展示"当前房间里都有谁"：把本地用户（标注"我"）与所有远端 peer 渲染成一排
// 彩色头像圆点 + 名字。头像圆点用用户的 awareness 颜色，和远端光标/选择框同色，
// 让"这个光标 = 这个人"的对应关系在视觉上闭环。
//
// 纯展示组件：数据来自 useAwareness 的 localUser + remoteStates，无内部状态。
//
// 样式拆分说明：静态样式（定位、尺寸、圆角、阴影等）放进 index.css 的 class 里；
// 动态部分——每个用户不同的颜色（背景色）、以及连接状态点的颜色——仍通过 inline
// style 传入，class + inline 混用，互不冲突。

import type { RemoteUser, RemotePresence } from '@/collab/awareness';
import './index.css';

interface PresenceBarProps {
  localUser: RemoteUser;
  remoteStates: RemotePresence[];
  connected: boolean;
}

function Avatar({ user, me }: { user: RemoteUser; me?: boolean }) {
  const initial = user.name.replace(/^访客-?/, '') || user.name.slice(0, 2);
  return (
    <div className="presence-avatar" title={user.name}>
      <span className="presence-avatar__initial" style={{ background: user.color }}>
        {initial}
      </span>
      <span className="presence-avatar__name">
        {user.name}
        {me && ' (我)'}
      </span>
    </div>
  );
}

export function PresenceBar({ localUser, remoteStates, connected }: PresenceBarProps) {
  const total = remoteStates.length + 1;
  return (
    <div className="presence-bar">
      <span
        className="presence-bar__status-dot"
        style={{ background: connected ? '#2f9e44' : '#adb5bd' }}
        title={connected ? '已连接' : '未连接'}
      />
      <span className="presence-bar__count">在线 {total}</span>
      <div className="presence-bar__avatars">
        <Avatar user={localUser} me />
        {remoteStates.map(p => (
          <Avatar key={p.clientId} user={p.user ?? { name: '访客', color: '#888' }} />
        ))}
      </div>
    </div>
  );
}
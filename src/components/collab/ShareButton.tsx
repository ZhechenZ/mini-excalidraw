// Week 5：分享按钮（生成 / 复制邀请链接）。
//
// 交互：
//   - 未开房（roomId 为空）：点击 → 生成随机 roomId 写进 URL hash → 触发 App
//     进入协同模式，同时把邀请链接复制到剪贴板；
//   - 已在房间：点击 → 直接复制当前房间的邀请链接。
// 复制后按钮给一个短暂的"已复制"反馈，2s 后复原。
//
// 组件本身不持有房间状态，roomId 由上层（App，来源于 URL hash）传入，保证
// "URL 即唯一事实来源"。开房这一步通过 onStartRoom 回调交回 App 处理。
//
// 样式拆分说明：所有静态样式放进 index.css 的 .share-button 里；复制成功后的
// "变绿"反馈用 BEM 修饰符 .share-button--copied 切换，避免把变色写成 inline。

import { useState } from 'react';
import { buildInviteUrl } from '@/utils/roomId';
import './index.css';

interface ShareButtonProps {
  roomId: string | null;
  readOnly: boolean;
  // 未开房时点击触发：由 App 生成 roomId + 写 hash。返回新 roomId 供复制。
  onStartRoom: () => string;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 降级：clipboard API 在非 https / 无权限时不可用，用一个临时 textarea。
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

export function ShareButton({ roomId, readOnly, onStartRoom }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    const id = roomId ?? onStartRoom();
    const url = buildInviteUrl(id, readOnly);
    const ok = await copyText(url);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const label = copied
    ? '✅ 链接已复制'
    : roomId
      ? '🔗 复制邀请链接'
      : '👥 发起协同';

  return (
    <button
      onClick={() => void handleClick()}
      className={`share-button${copied ? ' share-button--copied' : ''}`}
    >
      {label}
    </button>
  );
}
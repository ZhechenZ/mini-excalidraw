// Week 5：房间 ID 与 URL hash 路由。
//
// 协同房间完全由 URL hash 驱动，好处是"零后端、可分享、可刷新恢复"：
//   #room=ab12cd34            → 加入房间 ab12cd34（可编辑）
//   #room=ab12cd34&mode=view  → 以只读模式加入（禁用本地事务）
//
// 房间 ID 只用来做 y-webrtc 的信令频道名，不含任何敏感信息；真正的
// 端到端数据仍走 WebRTC P2P。这里刻意不依赖 react-router，一个 hash
// 解析函数 + 一个写入函数就够了，保持零额外依赖。

const ROOM_KEY = 'room';
const MODE_KEY = 'mode';
const VIEW_MODE = 'view';

// 房间 ID 用的字符集：去掉了易混淆的 0/O/1/l/I，方便口头/截图分享。
const ID_ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz';
const ID_LENGTH = 10;

export interface RoomRoute {
  roomId: string | null;
  readOnly: boolean;
}

// 生成一个随机房间 ID。用 crypto.getRandomValues 保证足够随机，
// 避免 Math.random 在多标签页快速开房时撞车。
export function generateRoomId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return out;
}

// 从当前 location.hash 解析房间路由。hash 形如 "#room=xxx&mode=view"。
export function readRoomFromHash(): RoomRoute {
  if (typeof window === 'undefined') return { roomId: null, readOnly: false };
  // 去掉开头的 '#'，用 URLSearchParams 解析，天然处理 & 与转义。
  const raw = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(raw);
  const roomId = params.get(ROOM_KEY);
  const readOnly = params.get(MODE_KEY) === VIEW_MODE;
  return { roomId: roomId && roomId.length > 0 ? roomId : null, readOnly };
}

// 把房间路由写回 hash（不刷新页面）。写入后主动派发一次 hashchange，
// 方便监听方（App）统一走 hashchange 处理，无需区分"程序写"还是"用户改"。
export function writeRoomToHash(roomId: string, readOnly = false): void {
  const params = new URLSearchParams();
  params.set(ROOM_KEY, roomId);
  if (readOnly) params.set(MODE_KEY, VIEW_MODE);
  const next = `#${params.toString()}`;
  if (window.location.hash === next) return;
  window.location.hash = next;
}

// 构造可复制的邀请链接：始终指向当前页面 origin+pathname，只换 hash。
// 邀请链接默认是可编辑的；如需只读分享，把 readOnly 传 true。
export function buildInviteUrl(roomId: string, readOnly = false): string {
  const { origin, pathname } = window.location;
  const params = new URLSearchParams();
  params.set(ROOM_KEY, roomId);
  if (readOnly) params.set(MODE_KEY, VIEW_MODE);
  return `${origin}${pathname}#${params.toString()}`;
}
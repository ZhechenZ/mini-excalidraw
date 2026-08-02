// Week 5：远端在线用户的光标 + 选择框覆盖层。
//
// 这是一个"只显示、不拦截交互"的全屏浮层（pointerEvents: none），叠在画布最上层。
// 它把每个远端 peer 的 awareness 状态渲染成两样东西：
//   1. 一个带用户名 tooltip 的彩色光标（SVG 箭头 + 名字标签）；
//   2. 该用户当前选中元素的外接框（虚线彩色描边），让协作时"谁选了什么"一目了然。
//
// 用 DOM/SVG 而非再开一层 canvas：光标数量少（房间上限 ~10 人），DOM 定位 +
// CSS 过渡更容易做出丝滑的光标移动与文字 tooltip，也省去一层 canvas 的重绘管理。
// 所有坐标都经 canvasToScreen 用当前视口（zoom/scroll）换算，保证与画布严格对齐。
//
// 样式拆分说明：静态样式（定位方式、过渡、圆角、阴影等）放进 index.css 的
// class 里；每帧变化的坐标（left/top/width/height）和每个用户不同的颜色
// （border-color / background）仍然通过 inline style 传入，class + inline
// 混用，互不冲突。

import { useMemo } from 'react';
import type { ExcalidrawElement } from '@/element/types';
import type { AppState } from '@/state/appState';
import type { RemotePresence } from '@/collab/awareness';
import { canvasToScreen } from '@/utils/viewport';
import { getCommonBounds } from '@/element/bounds';
import './index.css';

interface RemoteCursorsProps {
  remoteStates: RemotePresence[];
  elements: ExcalidrawElement[];
  appState: AppState;
}

export function RemoteCursors({ remoteStates, elements, appState }: RemoteCursorsProps) {
  // 建一次 id → 元素 的索引，供选择框按 id 快速取 bounds。
  const byId = useMemo(() => {
    const m = new Map<string, ExcalidrawElement>();
    for (const el of elements) m.set(el.id, el);
    return m;
  }, [elements]);

  const vp = { zoom: appState.zoom, scrollX: appState.scrollX, scrollY: appState.scrollY };

  return (
    <div className="remote-cursors-layer">
      {remoteStates.map(peer => {
        const color = peer.user?.color ?? '#888';
        const name = peer.user?.name ?? '访客';

        // ---- 选择框：该 peer 选中元素的外接框（虚线彩色） ----
        let selectionBox: React.ReactNode = null;
        if (peer.selectedIds && peer.selectedIds.length > 0) {
          const els = peer.selectedIds
            .map(id => byId.get(id))
            .filter((e): e is ExcalidrawElement => !!e);
          if (els.length > 0) {
            const b = getCommonBounds(els);
            const tl = canvasToScreen({ x: b.x1, y: b.y1 }, vp);
            const br = canvasToScreen({ x: b.x2, y: b.y2 }, vp);
            selectionBox = (
              <div
                className="remote-selection-box"
                style={{
                  left: tl.x,
                  top: tl.y,
                  width: br.x - tl.x,
                  height: br.y - tl.y,
                  borderColor: color,
                }}
              />
            );
          }
        }

        // ---- 光标 + 名字 tooltip ----
        let cursor: React.ReactNode = null;
        if (peer.pointer) {
          const s = canvasToScreen(peer.pointer, vp);
          cursor = (
            <div
              className="remote-cursor"
              style={{
                left: s.x,
                top: s.y,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5.5 3.2 L5.5 18.5 L9.4 14.7 L12.3 21 L14.9 19.9 L12 13.8 L17.3 13.8 Z"
                  fill={color}
                  stroke="#fff"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="remote-cursor-name" style={{ background: color }}>
                {name}
              </span>
            </div>
          );
        }

        return (
          <div key={peer.clientId}>
            {selectionBox}
            {cursor}
          </div>
        );
      })}
    </div>
  );
}
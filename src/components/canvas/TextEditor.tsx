import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './index.css';

interface Props {
  initialText: string;
  canvasX: number;
  canvasY: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  zoom: number;
  scrollX: number;
  scrollY: number;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

/**
 * 悬浮 textarea：位置跟 canvas 元素对齐，支持 IME。
 * blur 或 Esc 时 commit / cancel。
 */
export function TextEditor(props: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(props.initialText);
  const isComposingRef = useRef(false);

  // ✅ initialText 变化时同步（编辑不同 text 元素时也能刷新）
  useEffect(() => {
    setValue(props.initialText);
  }, [props.initialText]);

  // ✅ 延后一帧 focus，避开父组件同 tick 里的点击/pointer 抢焦点
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // ✅ 自动高度，最小值兜底避免高度为 0 看不见光标
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const minH = props.fontSize * props.zoom * 1.25;
    ta.style.height = Math.max(ta.scrollHeight, minH) + 'px';
  }, [value, props.fontSize, props.zoom]);

  const screenX = props.canvasX * props.zoom + props.scrollX;
  const screenY = props.canvasY * props.zoom + props.scrollY;

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => setValue(e.target.value)}
      onCompositionStart={() => { isComposingRef.current = true; }}
      onCompositionEnd={() => { isComposingRef.current = false; }}
      onBlur={() => props.onCommit(value)}
      // ✅ 阻止事件冒泡到 App/Canvas 的全局监听
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          props.onCancel();
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current) {
          e.preventDefault();
          props.onCommit(value);
        }
      }}
      onKeyUp={e => e.stopPropagation()}
      // ✅ 阻止点击事件穿透到 canvas 触发新一轮 pointerdown
      onMouseDown={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      className="text-editor"
      style={{
        left: screenX,
        top: screenY,
        fontSize: props.fontSize * props.zoom,
        fontFamily: props.fontFamily,
        color: props.color,
      }}
    />
  );
}
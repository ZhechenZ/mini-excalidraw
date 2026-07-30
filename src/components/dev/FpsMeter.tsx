import { useEffect, useRef, useState } from 'react';

// 右上角 FPS + 上一帧 renderScene 耗时展示。
// 用 requestAnimationFrame 每 500ms 汇总一次，避免频繁 setState。
export function FpsMeter() {
  const [fps, setFps] = useState(0);
  const [renderMs, setRenderMs] = useState(0);
  const framesRef = useRef(0);
  const lastRef = useRef(performance.now());

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      framesRef.current++;
      const now = performance.now();
      const dt = now - lastRef.current;
      if (dt >= 500) {
        setFps(Math.round((framesRef.current * 1000) / dt));
        framesRef.current = 0;
        lastRef.current = now;

        // 采样最近一次 renderScene measure（可能有多次，取平均）
        const measures = performance.getEntriesByName('renderScene', 'measure');
        if (measures.length) {
          const avg =
            measures.reduce((s, m) => s + m.duration, 0) / measures.length;
          setRenderMs(Math.round(avg * 100) / 100);
          performance.clearMeasures('renderScene');
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        zIndex: 9999,
        padding: '4px 10px',
        background: 'rgba(0,0,0,0.72)',
        color: fps >= 55 ? '#69db7c' : fps >= 30 ? '#ffd43b' : '#ff6b6b',
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: 12,
        borderRadius: 4,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      FPS {fps} · render {renderMs.toFixed(2)}ms
    </div>
  );
}
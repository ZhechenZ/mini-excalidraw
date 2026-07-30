// 基准数据生成器：在 URL 加 ?bench=4000 自动塞 4000 个随机元素，
// 用来测大规模场景下的渲染性能。

import type { ExcalidrawElement } from '@/element/types';
import { newRectangleElement, newEllipseElement } from '@/element/newElement';

export function readBenchCount(): number {
  if (typeof window === 'undefined') return 0;
  const p = new URLSearchParams(window.location.search);
  const n = parseInt(p.get('bench') || '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// mulberry32 伪随机，保证多次运行数据一致，便于对比
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLORS = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#7048e8'];

export function generateBenchElements(n: number, seed = 42): ExcalidrawElement[] {
  const rand = mulberry32(seed);
  const gridSize = Math.ceil(Math.sqrt(n));
  const cell = 120;
  const out: ExcalidrawElement[] = [];
  for (let i = 0; i < n; i++) {
    const gx = i % gridSize;
    const gy = Math.floor(i / gridSize);
    const x = gx * cell + rand() * 20;
    const y = gy * cell + rand() * 20;
    const width = 60 + rand() * 40;
    const height = 40 + rand() * 30;
    const strokeColor = COLORS[i % COLORS.length];
    const factory = i % 2 === 0 ? newRectangleElement : newEllipseElement;
    const el = factory({ x, y, strokeColor });
    // 手动补上 width/height（factory 默认是 0，绘制阶段依赖它们）
    (el as { width: number }).width = width;
    (el as { height: number }).height = height;
    out.push(el as ExcalidrawElement);
  }
  return out;
}
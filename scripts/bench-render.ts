// Week 6：渲染性能压测脚本（Node 环境，无需浏览器）。
//
// 目的：在 CI / 本地一键量化"大规模场景下的核心渲染前置开销"，输出一张
// Markdown 表格，便于贴进 README / 周报做趋势对比。
//
// 说明：真实 FPS 依赖浏览器合成，无法在纯 Node 精确复现。这里压测的是**渲染
// 前每帧必做的 CPU 工作**——构建 QuadTree 空间索引 + 视口裁剪查询（Week 2 的
// 核心路径），它直接决定"一帧里留给实际绘制的预算"。以固定 5000 元素场景，
// 连续跑 N 帧，统计单帧耗时分布与"折算 FPS 上限"和长任务（>50ms）计数。
//
// 运行：pnpm bench   （等价于 tsx scripts/bench-render.ts [count] [frames]）

import { generateBenchElements } from '../src/utils/bench';
import { buildSceneIndex, queryViewport } from '../src/element/spatialIndex';
import type { Bounds } from '../src/element/bounds';

const COUNT = Number(process.argv[2] ?? 5000);
const FRAMES = Number(process.argv[3] ?? 600); // ~10s @60fps 的帧预算数量

// 一个典型视口（世界坐标）：覆盖场景左上角一屏左右的区域。
const VIEWPORT: Bounds = { x1: 0, y1: 0, x2: 1440, y2: 900 };
const LONG_TASK_MS = 50;

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function main() {
  const elements = generateBenchElements(COUNT);

  const frameTimes: number[] = [];
  let longTasks = 0;

  for (let i = 0; i < FRAMES; i++) {
    const t0 = performance.now();
    // 模拟"数据变化后的一帧"：重建索引 + 视口裁剪（最坏情况，每帧都重建）。
    const index = buildSceneIndex(elements);
    const visible = queryViewport(index, elements, VIEWPORT);
    // 防止 JIT 把结果优化掉。
    if (visible.length < 0) throw new Error('unreachable');
    const dt = performance.now() - t0;
    frameTimes.push(dt);
    if (dt > LONG_TASK_MS) longTasks++;
  }

  const sorted = [...frameTimes].sort((a, b) => a - b);
  const sum = frameTimes.reduce((a, b) => a + b, 0);
  const avg = sum / frameTimes.length;
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const max = sorted[sorted.length - 1];
  const fpsCeil = avg > 0 ? Math.min(60, Math.round(1000 / avg)) : 60;

  const fmt = (n: number) => n.toFixed(3);
  console.log(`\n# bench-render 结果（${COUNT} 元素 × ${FRAMES} 帧）\n`);
  console.log('| 指标 | 数值 |');
  console.log('| - | - |');
  console.log(`| 元素数量 | ${COUNT} |`);
  console.log(`| 采样帧数 | ${FRAMES} |`);
  console.log(`| 单帧平均耗时 | ${fmt(avg)} ms |`);
  console.log(`| P50 单帧耗时 | ${fmt(p50)} ms |`);
  console.log(`| P95 单帧耗时 | ${fmt(p95)} ms |`);
  console.log(`| 最长单帧 | ${fmt(max)} ms |`);
  console.log(`| 折算 FPS 上限 | ${fpsCeil} |`);
  console.log(`| 长任务(>${LONG_TASK_MS}ms) 帧数 | ${longTasks} |`);
  console.log('');
}

main();
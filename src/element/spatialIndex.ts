// 场景空间索引：把 elements 数组包装成 QuadTree，
// 提供视口查询、点查询、矩形框选三种高层 API。
//
// 索引在 Canvas 层用 useMemo 从 elements 派生：elements ref 变才重建。
// 拖动过程中因为不 setElements，所以索引不会频繁重建（W1 已经保证）。

import type { ExcalidrawElement } from './types';
import type { Bounds } from './bounds';
import { getElementBounds } from './bounds';
import { QuadTree, buildQuadTree } from './quadtree';

export function buildSceneIndex(
  elements: readonly ExcalidrawElement[],
): QuadTree | null {
  const items = elements.map(el => ({ id: el.id, bounds: getElementBounds(el) }));
  return buildQuadTree(items);
}

// 视口裁剪：只返回外接矩形与视口相交的元素
export function queryViewport(
  tree: QuadTree | null,
  elements: readonly ExcalidrawElement[],
  viewport: Bounds,
): ExcalidrawElement[] {
  if (!tree || elements.length === 0) return elements as ExcalidrawElement[];
  const ids = new Set<string>();
  tree.queryRect(viewport, ids);
  const out: ExcalidrawElement[] = [];
  for (const el of elements) if (ids.has(el.id)) out.push(el);
  return out;
}

// 点查询候选集：返回外接矩形覆盖该点的元素（顺序按 elements 原顺序）
export function queryPointCandidates(
  tree: QuadTree | null,
  elements: readonly ExcalidrawElement[],
  x: number, y: number,
): ExcalidrawElement[] {
  if (!tree) return elements as ExcalidrawElement[];
  const ids = new Set<string>();
  tree.queryPoint(x, y, ids);
  const out: ExcalidrawElement[] = [];
  for (const el of elements) if (ids.has(el.id)) out.push(el);
  return out;
}

// 矩形框选候选集
export function queryRectCandidates(
  tree: QuadTree | null,
  elements: readonly ExcalidrawElement[],
  rect: Bounds,
): ExcalidrawElement[] {
  if (!tree) return elements as ExcalidrawElement[];
  const ids = new Set<string>();
  tree.queryRect(rect, ids);
  const out: ExcalidrawElement[] = [];
  for (const el of elements) if (ids.has(el.id)) out.push(el);
  return out;
}
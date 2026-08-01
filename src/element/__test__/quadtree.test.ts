// QuadTree 单元测试（Vitest）。
// 覆盖：空树、插入、点查询、范围查询、边界情况、大规模基准、跨象限边界、完全包裹、完全分离、重叠节点极值
//
// 运行：pnpm add -D vitest && pnpm vitest run

import { describe, it, expect } from 'vitest';
import { QuadTree, buildQuadTree } from '@/element/quadtree';

const B = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2 });

describe('QuadTree', () => {
  it('handles empty item list return null root', () => {
    const tree = buildQuadTree([]);
    expect(tree).toBeNull();
  });

  it('single item point query hit & miss', () => {
    const tree = buildQuadTree([{ id: 'a', bounds: B(0, 0, 10, 10) }])!;
    const result = new Set<string>();

    tree.queryPoint(5, 5, result);
    expect(result.has('a')).toBeTruthy();

    result.clear();
    tree.queryPoint(50, 50, result);
    expect(result.has('a')).toBeFalsy();
  });

  it('rect range query only return intersecting shapes', () => {
    const tree = buildQuadTree([
      { id: 'a', bounds: B(0, 0, 10, 10) },
      { id: 'b', bounds: B(100, 100, 110, 110) },
      { id: 'c', bounds: B(5, 5, 105, 105) },
    ])!;
    const result = new Set<string>();

    tree.queryRect(B(0, 0, 20, 20), result);
    expect([...result].sort()).toEqual(['a', 'c']);
  });

  it('node auto subdivide when exceed capacity limit', () => {
    const itemList = Array.from({ length: 100 }, (_, idx) => ({
      id: String(idx),
      bounds: B(idx * 5, idx * 5, idx * 5 + 3, idx * 5 + 3),
    }));
    const tree = buildQuadTree(itemList)!;
    expect(tree.countNodes()).toBeGreaterThan(1);
  });

  it('10000 elements benchmark fast rectangle query', () => {
    const total = 10000;
    const itemList = Array.from({ length: total }, (_, i) => {
      const gridX = i % 100;
      const gridY = Math.floor(i / 100);
      return {
        id: String(i),
        bounds: B(gridX * 20, gridY * 20, gridX * 20 + 15, gridY * 20 + 15),
      };
    });
    const tree = buildQuadTree(itemList)!;
    const result = new Set<string>();
    const startTime = performance.now();

    for (let i = 0; i < 100; i++) {
      result.clear();
      tree.queryRect(B(500, 500, 700, 700), result);
    }

    const useTime = performance.now() - startTime;
    expect(useTime).toBeLessThan(200);
    expect(result.size).toBeGreaterThan(0);
  });

  it('negative coordinate boundary element point query match', () => {
    const tree = buildQuadTree([
      { id: 'edge', bounds: B(-10, -10, 0, 0) },
    ])!;
    const result = new Set<string>();
    tree.queryPoint(-5, -5, result);
    expect(result.has('edge')).toBe(true);
  });

  it('element exactly on split boundary can be queried', () => {
    const tree = buildQuadTree([
      { id: 'border', bounds: B(50, 50, 50, 50) },
    ])!;
    const result = new Set<string>();
    tree.queryPoint(50, 50, result);
    expect(result.has('border')).toBe(true);
  });

  it('query rect fully inside quadtree item get match', () => {
    const tree = buildQuadTree([{ id: 'big', bounds: B(10, 10, 100, 100) }])!;
    const result = new Set<string>();
    tree.queryRect(B(20, 20, 30, 30), result);
    expect(result.has('big')).toBe(true);
  });

  it('query rect fully separated no result', () => {
    const tree = buildQuadTree([{ id: 'obj', bounds: B(0, 0, 10, 10) }])!;
    const result = new Set<string>();
    tree.queryRect(B(20, 20, 30, 30), result);
    expect(result.size).toBe(0);
  });

  it('multiple overlapping items all retrieved in range query', () => {
    const tree = buildQuadTree([
      { id: 'o1', bounds: B(0, 0, 20, 20) },
      { id: 'o2', bounds: B(10, 10, 30, 30) },
      { id: 'o3', bounds: B(5, 5, 15, 15) },
    ])!;
    const res = new Set<string>();
    tree.queryRect(B(0, 0, 30, 30), res);
    expect([...res].sort()).toEqual(['o1', 'o2', 'o3']);
  });
});
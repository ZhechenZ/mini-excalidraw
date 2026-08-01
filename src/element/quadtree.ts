// QuadTree 空间索引：把元素按外接矩形挂到二维网格上，
// 支持 O(log n) 范围查询（用于视口裁剪和框选命中）。
//
// 简化实现要点：
// - 容量分裂：单节点超过 CAPACITY 就分成 4 象限；到达 MAX_DEPTH 停止分裂
// - 一个 item 若跨越多个象限，会被复制到所有相交的子节点（简单可用，不追求内存最优）
// - 查询用去重 Set 返回 id，避免重复元素

import type { Bounds } from './bounds';

export interface QuadTreeItem {
  id: string;
  bounds: Bounds;
}

const CAPACITY = 8;
const MAX_DEPTH = 8;

export class QuadTree {
  private items: QuadTreeItem[] = [];
  private children: QuadTree[] | null = null;
  private bounds: Bounds;
  private depth: number;

  constructor(bounds: Bounds, depth = 0) {
    this.bounds = bounds;
    this.depth = depth;
  }

  insert(item: QuadTreeItem): boolean {
    if (!intersects(this.bounds, item.bounds)) return false;
    if (this.children) {
      let inserted = false;
      for (const c of this.children) if (c.insert(item)) inserted = true;
      return inserted;
    }
    this.items.push(item);
    if (this.items.length > CAPACITY && this.depth < MAX_DEPTH) this.subdivide();
    return true;
  }

  queryRect(range: Bounds, out: Set<string>): void {
    if (!intersects(this.bounds, range)) return;
    for (const it of this.items) {
      if (intersects(it.bounds, range)) out.add(it.id);
    }
    if (this.children) for (const c of this.children) c.queryRect(range, out);
  }

  queryPoint(x: number, y: number, out: Set<string>): void {
    if (!containsPoint(this.bounds, x, y)) return;
    for (const it of this.items) {
      if (containsPoint(it.bounds, x, y)) out.add(it.id);
    }
    if (this.children) for (const c of this.children) c.queryPoint(x, y, out);
  }

  private subdivide() {
    const { x1, y1, x2, y2 } = this.bounds;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    this.children = [
      new QuadTree({ x1, y1, x2: mx, y2: my }, this.depth + 1),
      new QuadTree({ x1: mx, y1, x2, y2: my }, this.depth + 1),
      new QuadTree({ x1, y1: my, x2: mx, y2 }, this.depth + 1),
      new QuadTree({ x1: mx, y1: my, x2, y2 }, this.depth + 1),
    ];
    const existing = this.items;
    this.items = [];
    for (const it of existing) for (const c of this.children) c.insert(it);
  }

  // 仅用于测试和调试：递归返回节点数
  countNodes(): number {
    return 1 + (this.children ? this.children.reduce((s, c) => s + c.countNodes(), 0) : 0);
  }
}

export function buildQuadTree(items: QuadTreeItem[]): QuadTree | null {
  if (items.length === 0) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const it of items) {
    if (it.bounds.x1 < x1) x1 = it.bounds.x1;
    if (it.bounds.y1 < y1) y1 = it.bounds.y1;
    if (it.bounds.x2 > x2) x2 = it.bounds.x2;
    if (it.bounds.y2 > y2) y2 = it.bounds.y2;
  }
  // 加一圈 padding，避免元素刚好卡在根节点边界
  const pad = 100;
  const tree = new QuadTree({ x1: x1 - pad, y1: y1 - pad, x2: x2 + pad, y2: y2 + pad });
  for (const it of items) tree.insert(it);
  return tree;
}

function intersects(a: Bounds, b: Bounds) {
  return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
}

function containsPoint(b: Bounds, x: number, y: number) {
  return x >= b.x1 && x <= b.x2 && y >= b.y1 && y <= b.y2;
}
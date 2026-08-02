// Week 6：export/exportBounds 单测 —— 导出图片/PDF 的画布裁剪矩形。
//
// 覆盖：空场景返回 null、单元素加默认 padding、多元素外接矩形 + 自定义 padding。

import { describe, it, expect } from 'vitest';
import { getExportBounds } from '@/export/exportBounds';
import type { ExcalidrawElement } from '@/element/types';

function rect(patch: Partial<ExcalidrawElement>): ExcalidrawElement {
  return {
    id: 'r', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, angle: 0,
    strokeColor: '#000', backgroundColor: 'transparent', strokeWidth: 2,
    roughness: 1, seed: 1, version: 1, versionNonce: 1, groupIds: [],
    ...patch,
  } as ExcalidrawElement;
}

describe('getExportBounds', () => {
  it('returns null for empty scene', () => {
    expect(getExportBounds([])).toBeNull();
  });

  it('adds default padding around a single element', () => {
    expect(getExportBounds([rect({ x: 0, y: 0, width: 100, height: 50 })]))
      .toEqual({ x: -20, y: -20, width: 140, height: 90 });
  });

  it('wraps multiple elements with custom padding', () => {
    const els = [
      rect({ x: 0, y: 0, width: 10, height: 10 }),
      rect({ x: 90, y: 40, width: 10, height: 10 }),
    ];
    expect(getExportBounds(els, 5))
      .toEqual({ x: -5, y: -5, width: 110, height: 60 });
  });
});
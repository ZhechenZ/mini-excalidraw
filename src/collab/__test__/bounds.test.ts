// Week 6：element/bounds 单测 —— 包围盒计算是命中测试、选择框、导出的公共基础。
//
// 覆盖：矩形正/负宽高的归一化、freedraw 基于 points 的包围盒、多元素 getCommonBounds。

import { describe, it, expect } from 'vitest';
import { getElementBounds, getCommonBounds } from '@/element/bounds';
import type { ExcalidrawElement, ExcalidrawFreedrawElement } from '@/element/types';

function rect(patch: Partial<ExcalidrawElement>): ExcalidrawElement {
  return {
    id: 'r', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, angle: 0,
    strokeColor: '#000', backgroundColor: 'transparent', strokeWidth: 2,
    roughness: 1, seed: 1, version: 1, versionNonce: 1, groupIds: [],
    ...patch,
  } as ExcalidrawElement;
}

describe('getElementBounds', () => {
  it('computes bounds for a normal rectangle', () => {
    expect(getElementBounds(rect({ x: 5, y: 5, width: 20, height: 10 })))
      .toEqual({ x1: 5, y1: 5, x2: 25, y2: 15 });
  });

  it('normalizes negative width/height', () => {
    expect(getElementBounds(rect({ x: 30, y: 30, width: -20, height: -10 })))
      .toEqual({ x1: 10, y1: 20, x2: 30, y2: 30 });
  });

  it('computes freedraw bounds from points', () => {
    const fd: ExcalidrawFreedrawElement = {
      ...(rect({ x: 100, y: 100 }) as ExcalidrawElement),
      type: 'freedraw',
      points: [[0, 0, 0.5], [10, 20, 0.5], [-5, 5, 0.5]],
    } as ExcalidrawFreedrawElement;
    expect(getElementBounds(fd)).toEqual({ x1: 95, y1: 100, x2: 110, y2: 120 });
  });
});

describe('getCommonBounds', () => {
  it('merges multiple element bounds', () => {
    const a = rect({ x: 0, y: 0, width: 10, height: 10 });
    const b = rect({ x: 50, y: 40, width: 10, height: 10 });
    expect(getCommonBounds([a, b])).toEqual({ x1: 0, y1: 0, x2: 60, y2: 50 });
  });
});
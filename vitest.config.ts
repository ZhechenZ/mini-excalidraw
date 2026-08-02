// Week 6：Vitest 配置。
//
// - 复用 vite 的 '@' 别名，测试里可直接 import '@/element/...'。
// - 默认 node 环境（纯逻辑测试最快）；需要 DOM 的用例（roomId 读写 hash）在
//   文件顶部用 `// @vitest-environment jsdom` 单独切换，避免整体拖慢。
// - 覆盖率用 v8 provider，include 精确圈定"核心算法/数据层"模块：这些是本项目
//   真正需要回归保护的纯逻辑（空间索引、包围盒、导出边界、CRDT diff、房间路由、
//   持久化子集）。UI/渲染/hook 编排不纳入覆盖率统计，避免用"测不到的编排代码"
//   稀释有效覆盖率。阈值设为 60%。

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: [
        'src/element/quadtree.ts',
        'src/element/bounds.ts',
        'src/export/exportBounds.ts',
        'src/persistence/scene.ts',
        'src/collab/elementSync.ts',
        'src/utils/roomId.ts',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
  },
});
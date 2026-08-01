// 顶部菜单：保存 / 加载 / 清空 / 导出 PNG·JPG·PDF·JSON。
// 样式抽到同目录 index.css，组件不含 inline style。

import { useState } from 'react';
import type { ExcalidrawElement } from '@/element/types';
import type { AppState } from '@/state/appState';
import { exportToPng, exportToJpg } from '@/export/exportToPng';
import { exportToPdf } from '@/export/exportToPdf';
import { exportToJson, pickAndParseSceneFile, type SceneFile } from '@/export/exportToJson';
import { clearScene } from '@/persistence/scene';
import type { SaveStatus } from '@/persistence/useAutosave';
import './index.css';

interface AppMenuProps {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
  saveStatus: SaveStatus;
  onFlush: () => Promise<void>;
  onImportScene: (file: SceneFile) => void;
  onClearScene: () => void;
}

const statusLabel: Record<SaveStatus, string> = {
  idle: '',
  saving: '保存中…',
  saved: '已自动保存',
  error: '保存失败',
};

export function AppMenu({
  elements,
  appState,
  saveStatus,
  onFlush,
  onImportScene,
  onClearScene,
}: AppMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="app-menu">
      <button className="app-menu__btn" onClick={() => setOpen(o => !o)}>
        菜单 ▾
      </button>
      <span className="app-menu__status">{statusLabel[saveStatus]}</span>

      {open && (
        <div className="app-menu__panel">
          <button
            className="app-menu__btn"
            onClick={() => {
              void onFlush();
              setOpen(false);
            }}
          >
            💾 立即保存
          </button>

          <button
            className="app-menu__btn"
            onClick={async () => {
              const f = await pickAndParseSceneFile();
              if (f) onImportScene(f);
              setOpen(false);
            }}
          >
            📂 导入 JSON
          </button>

          <button
            className="app-menu__btn"
            onClick={() => {
              exportToJson(elements, appState);
              setOpen(false);
            }}
          >
            📤 导出 JSON
          </button>

          <button
            className="app-menu__btn"
            onClick={() => {
              void exportToPng(elements);
              setOpen(false);
            }}
          >
            🖼️ 导出 PNG
          </button>

          <button
            className="app-menu__btn"
            onClick={() => {
              void exportToJpg(elements);
              setOpen(false);
            }}
          >
            🖼️ 导出 JPG
          </button>

          <button
            className="app-menu__btn"
            onClick={() => {
              void exportToPdf(elements);
              setOpen(false);
            }}
          >
            📄 导出 PDF
          </button>

          <button
            className="app-menu__btn app-menu__btn--danger"
            onClick={async () => {
              if (!confirm('确定清空本地场景？此操作不可撤销。')) return;
              await clearScene();
              onClearScene();
              setOpen(false);
            }}
          >
            🗑️ 清空本地场景
          </button>
        </div>
      )}
    </div>
  );
}
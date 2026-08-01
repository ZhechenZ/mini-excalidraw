// JSON 场景导入 / 导出，格式借鉴 Excalidraw 的 .excalidraw：
// {
//   "type": "mini-excalidraw",
//   "version": 1,
//   "elements": ExcalidrawElement[],
//   "appState": Partial<AppState>
// }
//
// - 用于备份、跨设备手动同步、以及未来接入协同后的 fallback
// - 导入使用 <input type="file"> 触发，避免复杂依赖

import type { ExcalidrawElement } from '@/element/types';
import type { AppState } from '@/state/appState';
import { pickPersistedAppState, SCENE_VERSION } from '@/persistence/scene';

const FILE_TYPE = 'mini-excalidraw';

export interface SceneFile {
  type: typeof FILE_TYPE;
  version: number;
  elements: ExcalidrawElement[];
  appState: ReturnType<typeof pickPersistedAppState>;
}

export function elementsToJson(
  elements: readonly ExcalidrawElement[],
  appState: AppState,
): string {
  const file: SceneFile = {
    type: FILE_TYPE,
    version: SCENE_VERSION,
    elements: [...elements],
    appState: pickPersistedAppState(appState),
  };
  return JSON.stringify(file, null, 2);
}

export function exportToJson(
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  filename = `mini-excalidraw-${Date.now()}.json`,
): void {
  const text = elementsToJson(elements, appState);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseSceneFile(text: string): SceneFile {
  const parsed = JSON.parse(text) as SceneFile;
  if (parsed.type !== FILE_TYPE) throw new Error('Not a mini-excalidraw file');
  if (typeof parsed.version !== 'number') throw new Error('Missing version');
  if (!Array.isArray(parsed.elements)) throw new Error('Missing elements');
  return parsed;
}

// 触发系统文件选择框读取 JSON
export function pickAndParseSceneFile(): Promise<SceneFile | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json,.excalidraw';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(parseSceneFile(String(reader.result)));
        } catch (e) {
          console.error('[import] parse failed', e);
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(f);
    };
    input.click();
  });
}
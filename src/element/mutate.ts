import type { ExcalidrawElement } from './types';

const nonce = () => Math.floor(Math.random() * 2 ** 31);

export function translateElement(
  el: ExcalidrawElement, dx: number, dy: number,
): ExcalidrawElement {
  return {
    ...el,
    x: el.x + dx,
    y: el.y + dy,
    version: el.version + 1,
    versionNonce: nonce(),
  };
}
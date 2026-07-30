// 性能埋点工具。用 performance API 打点，比 console.time 精度更高，
// 且不影响生产环境（未 mark 时几乎 0 开销）。

const enabled =
  typeof performance !== 'undefined' && typeof performance.mark === 'function';

export function perfMark(name: string) {
  if (enabled) performance.mark(name);
}

export function perfMeasure(name: string, startMark: string, endMark: string) {
  if (!enabled) return;
  try {
    performance.measure(name, startMark, endMark);
  } catch {
    // marks 不存在或已被清除
  }
}

export function perfClear(name: string) {
  if (!enabled) return;
  try {
    performance.clearMeasures(name);
    performance.clearMarks(name);
  } catch {
    /* noop */
  }
}
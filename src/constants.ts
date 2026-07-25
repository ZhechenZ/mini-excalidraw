export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 30;
export const TOOLS = [
    'selection',
    'rectangle',
    'ellipse',
    'line',
    'arrow',
    'freedraw',
    'text'
] as const;
export type Tool = typeof TOOLS[number];
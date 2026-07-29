export interface ExcalidrawElementBase {
    id: string;
    type: 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'freedraw' | 'text';
    x: number;
    y: number;
    width: number;
    height: number;
    angle: number;
    strokeColor: string;
    backgroundColor: string;
    strokeWidth: number;
    roughness: number;
    seed: number;
    version: number;
    versionNonce: number;
    // ✅ Week 2：所有元素都可能属于 0..N 个组
    groupIds: string[];
}

export interface ExcalidrawRectangleElement extends ExcalidrawElementBase { type: 'rectangle' }
export interface ExcalidrawEllipseElement   extends ExcalidrawElementBase { type: 'ellipse'   }
export interface ExcalidrawLineElement      extends ExcalidrawElementBase { type: 'line'      }
export interface ExcalidrawArrowElement     extends ExcalidrawElementBase { type: 'arrow'     }

export interface ExcalidrawFreedrawElement extends ExcalidrawElementBase {
    type: 'freedraw';
    points: [number, number, number][];
}

// ✅ Week 2：text
export interface ExcalidrawTextElement extends ExcalidrawElementBase {
    type: 'text';
    text: string;
    fontSize: number;   // px
    fontFamily: string;
    textAlign: 'left' | 'center' | 'right';
    baseline: number;   // 用于 canvas fillText 基线偏移，等于 fontSize * 0.8
}

export type ExcalidrawElement =
    | ExcalidrawRectangleElement
    | ExcalidrawEllipseElement
    | ExcalidrawLineElement
    | ExcalidrawArrowElement
    | ExcalidrawFreedrawElement
    | ExcalidrawTextElement;
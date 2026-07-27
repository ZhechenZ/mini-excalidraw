export interface ExcalidrawElementBase {
    id: string;
    type: 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'freedraw' | 'text';
    x:number;
    y:number;
    width:number;
    height:number;
    angle:number;
    strokeColor:string;
    backgroundColor:string;
    strokeWidth:number;
    roughness:number; //手绘强度
    seed:number;    //随机种子，保证同一元素每次抖动都一样
    version:number;
    versionNonce:number;
}

export interface ExcalidrawRectangleElement extends ExcalidrawElementBase {
    type: 'rectangle'
}

export interface ExcalidrawEllipseElement extends ExcalidrawElementBase{
    type: 'ellipse';
}

// 直线 / 箭头: 起点是(x, y), 终点用相对偏移 (width, height) 表示
// 这样平移只改 x,y, 缩放只改 width, height, 跟矩形一致
export interface ExcalidrawLineElement extends ExcalidrawElementBase {
    type: 'line';
} 

export interface ExcalidrawArrowElement extends ExcalidrawElementBase {
    type: 'arrow';
}

export interface ExcalidrawFreedrawElement extends ExcalidrawElementBase {
    type:'freedraw';
    points:[number, number, number][];
}

export type ExcalidrawElement = 
    | ExcalidrawRectangleElement
    | ExcalidrawEllipseElement
    | ExcalidrawLineElement
    | ExcalidrawArrowElement
    | ExcalidrawFreedrawElement;
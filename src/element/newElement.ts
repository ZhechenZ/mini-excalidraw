import { nanoid } from 'nanoid';
import type {
    ExcalidrawElement,
    ExcalidrawRectangleElement,
    ExcalidrawArrowElement,
    ExcalidrawEllipseElement,
    ExcalidrawLineElement
} from './types';

const randomInteger = () => Math.floor(Math.random() * 2 ** 31);

interface NewElementProps {
    x: number;
    y: number;
    width?: number;
    height?: number;
    strokeColor?: string;
    backgroundColor?: string;
}

function baseElement(props: NewElementProps){
    return {
        id:nanoid(),
        x:props.x,
        y:props.y,
        width:props.width ?? 0,
        height:props.height ?? 0,
        angle:0,
        strokeColor:props.strokeColor ?? '#1e1e1e',
        backgroundColor:props.backgroundColor ?? 'transparent',
        strokeWidth:2,
        roughness:1,
        seed:randomInteger(),
        version:1,
        versionNonce:randomInteger(),
    };
}

export function newRectangleElement(p: NewElementProps): ExcalidrawRectangleElement {
    return {...baseElement(p), type: 'rectangle'};
}

export function newEllipseElement(p: NewElementProps): ExcalidrawEllipseElement {
    return {...baseElement(p), type:'ellipse'};
}

export function newLineElement(p:NewElementProps): ExcalidrawLineElement {
    return {...baseElement(p), type:'line'};
}

export function newArrowElement(p:NewElementProps): ExcalidrawArrowElement {
    return {...baseElement(p), type:'arrow'};
}

export function newElementByTool(
  tool: 'rectangle' | 'ellipse' | 'line' | 'arrow',
  p: NewElementProps,
  opts: { roughness: number },
): ExcalidrawElement {
  let el: ExcalidrawElement;
  switch (tool) {
    case 'rectangle':
      el = newRectangleElement(p);
      break;
    case 'ellipse':
      el = newEllipseElement(p);
      break;
    case 'line':
      el = newLineElement(p);
      break;
    case 'arrow':
      el = newArrowElement(p);
      break;
    default:
      throw new Error(`unsupported drawing tool: ${tool}`);
  }
  el.roughness = opts.roughness;
  return el;
}

//拖动过程中更新终点: 把(x2, y2)转成(x,y,width,height)
//允许负宽高(往左上托), 最后pointerup时再规范化
export function mutateElementEnd(
    el:ExcalidrawElement,
    x2:number,
    y2:number,
):ExcalidrawElement{
    return {
        ...el,
        width: x2 - el.x,
        height: y2 - el.y,
        version: el.version + 1,
        versionNonce: randomInteger(),
    };
}

// pointerup 时规范化: 保证width/height都是正数, 起点是左上角
export function normalizeElement(el: ExcalidrawElement): ExcalidrawElement {
    // 直线 / 箭头保留负分量, 因为这两者表示方向
    if(el.type === 'line' || el.type === 'arrow'){
        return el;
    }
    const x = Math.min(el.x, el.x+el.width);
    const y = Math.min(el.y, el.y+el.height);
    return {
        ...el,
        x,
        y,
        width:Math.abs(el.width),
        height:Math.abs(el.height),
    };
}
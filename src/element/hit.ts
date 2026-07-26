import type { ExcalidrawElement } from "./types";
import { getElementBounds } from "./bounds";

const THRESHOLD = 6; // 线段或者箭头允许有6px的容差

export function hitTest(
    el:ExcalidrawElement,
    px:number,
    py:number,
):boolean{
    switch(el.type){
        case 'rectangle': return hitRectangle(el,px,py);
        case 'ellipse': return hitEllipse(el,px,py);
        case 'line':
        case 'arrow': return hitLine(el,px,py);
    }
}

//矩形: 边命中(无填充) or 整体命中(有填充)
function hitRectangle(
    el:ExcalidrawElement,
    px:number,
    py:number,
):boolean{
    const b = getElementBounds(el);
    const inside = px >= b.x1 && px <= b.x2 && py>=b.y1 && py <= b.y2;
    if(el.backgroundColor !== 'transparent') return inside;
    if(!inside) return false;

    //边框附近才算命中
    return (
        Math.abs(px - b.x1) < THRESHOLD || Math.abs(px - b.x2) < THRESHOLD || 
        Math.abs(py - b.y1) < THRESHOLD || Math.abs(py - b.y2) < THRESHOLD
    );
}

//椭圆 (x/a)^2 + (y/b)^2 <= 1
function hitEllipse(
    el:ExcalidrawElement,
    px:number,
    py:number,
):boolean{
    const cx = el.x + el.width/2;
    const cy = el.y + el.height/2;
    const a = Math.abs(el.width/2);
    const b = Math.abs(el.height/2);

    if(a === 0 || b === 0) return false;
    const value = ((px - cx) / a) ** 2 + ((py - cy) / b) ** 2;
    if(el.backgroundColor !== 'transparent') return value<=1;
    //只命中边框
    return Math.abs(value - 1) < 0.15;
}

//线段: 点到线段的最短距离 <= THRESHOLD
function hitLine(
    el:ExcalidrawElement,
    px:number,
    py:number,
):boolean{
    const x1 = el.x, y1 = el.y;
    const x2 = el.x + el.width, y2 = el.y + el.height;
    return pointToSegmentDistance(px, py, x1, y1, x2, y2) < THRESHOLD;
}

//通用几何: 点到线段的距离
export function pointToSegmentDistance(
    px:number,py:number,
    x1:number,y1:number,
    x2:number,y2:number,
):number{
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if(lenSq === 0) return Math.hypot(px - x1, py - y1);

    let t = ((px - x1) * dx) +  ((py - y1) * dy) / lenSq;
    t = Math.max(0,Math.min(1,t));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
}

// 元素是否在框选矩形内（AABB vs AABB 的相交或包含）
export function hitMarquee(
  el: ExcalidrawElement,
  m: { x: number; y: number; width: number; height: number },
): boolean {
  const b = getElementBounds(el);
  const mx1 = Math.min(m.x, m.x + m.width);
  const my1 = Math.min(m.y, m.y + m.height);
  const mx2 = Math.max(m.x, m.x + m.width);
  const my2 = Math.max(m.y, m.y + m.height);
  // 相交：任一 AABB 的角落在另一个内部，或边框相交 → 用不相交的补集更简单
  return !(b.x2 < mx1 || b.x1 > mx2 || b.y2 < my1 || b.y1 > my2);
}

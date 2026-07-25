export type ScreenPoint = {x:number;y:number};
export type CanvasPoint = {x:number;y:number};
export interface Viewport {
    scrollX:number;
    scrollY:number;
    zoom:number;//放缩比例
}
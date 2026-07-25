import type {Tool} from '@/constants'

export interface AppState {
    currentTool: Tool;
    scrollX: number;
    scrollY: number;
    zoom: number;
    cursor: {
        x:number,
        y:number,
    } | null;
}

export function createInitialAppState(): AppState {
    return {
        currentTool: 'selection',
        scrollX: 0,
        scrollY:0,
        zoom:1,
        cursor:null,
    }
}
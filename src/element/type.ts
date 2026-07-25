export interface ExcalidrawElement {
    id: string;
    type: 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'freedraw' | 'text';
    x:number;
    y:number;
    width:number;
    height:number;
    angle:number;
    strokeColor:string;
    backgroundColor:string;
    version:number;
    versionNonce:number;
}
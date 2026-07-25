import './index.css';

interface StatusBarProps {
    cursor:{x:number, y:number} | null,
    zoom:number,
}

export function StatusBar({cursor, zoom}: StatusBarProps) {
    return (
        <div className="status-bar">
            <div className="status-bar__item">
                坐标: {cursor ? `${Math.round(cursor.x)}, ${Math.round(cursor.y)}` : '-'}
            </div>
            <div className="status-bar__item">
                缩放:{Math.round(zoom * 100)}%
            </div>
        </div>
    );
}
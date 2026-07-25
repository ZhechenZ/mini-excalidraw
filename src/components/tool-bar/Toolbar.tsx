import { TOOLS, type Tool } from "@/constants";
import './index.css';

interface ToolbarProps {
    currentTool: Tool;
    onToolChange:(tool:Tool) => void;
}

const ICON: Record<Tool, string> = {
    selection: '🖱',
    rectangle: '▭',
    ellipse: '○',
    line: '／',
    arrow: '→',
    freedraw: '✎',
    text: 'T',
};

export function Toolbar({currentTool, onToolChange}: ToolbarProps){
    return (
        <div className="toolbar">
            {TOOLS.map((t) => {
                const isActive = currentTool === t;
                const btnStyle = isActive
                    ? 'toolbar__btn toolbar__btn--active'
                    : 'toolbar__btn';
                return (
                    <button
                        key={t}
                        className={btnStyle}
                        onClick={() => onToolChange(t)}
                        title={t}
                    >
                    {ICON[t]}
                    </button>
                )
            })}
        </div>
    )
}
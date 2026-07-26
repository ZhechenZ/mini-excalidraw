import { TOOLS, type Tool } from '@/constants';
import { RoughnessSlider } from '@/components/tool-bar/RoughnessSlider';
import './index.css';

interface ToolbarProps {
  currentTool: Tool;
  onToolChange: (tool: Tool) => void;
  roughness: number;
  onRoughnessChange: (value: number) => void;
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

export function Toolbar({
  currentTool,
  onToolChange,
  roughness,
  onRoughnessChange,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      {TOOLS.map((tool) => {
        const isActive = currentTool === tool;
        return (
          <button
            key={tool}
            className={`toolbar__btn ${isActive ? 'toolbar__btn--active' : ''}`}
            onClick={() => onToolChange(tool)}
            title={tool}
          >
            {ICON[tool]}
          </button>
        );
      })}

      <span className="toolbar__divider" aria-hidden />

      <RoughnessSlider roughness={roughness} onChange={onRoughnessChange} />
    </div>
  );
}
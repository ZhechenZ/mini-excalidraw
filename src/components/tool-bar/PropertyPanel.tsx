import type { ExcalidrawElement } from '@/element/types';

const STROKE_PALETTE = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5'];
const FILL_PALETTE   = ['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99', '#eebefa'];
const STROKE_WIDTHS  = [1, 2, 4, 8];

interface Props {
    selected: ExcalidrawElement[];
    onPatch: (patch: Partial<ExcalidrawElement>) => void;
}

export function PropertyPanel({ selected, onPatch }: Props) {
    if (selected.length === 0) return null;
    const first = selected[0];
    return (
        <div className="prop-panel">
            <Row label="描边">
                {STROKE_PALETTE.map((c) => (
                    <button
                        key={c}
                        className={`chip ${first.strokeColor === c ? 'chip--active' : ''}`}
                        style={{ background: c }}
                        onClick={() => onPatch({ strokeColor: c })}
                        title={c}
                    />
                ))}
            </Row>
            <Row label="填充">
                {FILL_PALETTE.map((c) => (
                    <button
                        key={c}
                        className={`chip ${first.backgroundColor === c ? 'chip--active' : ''}`}
                        style={{
                            background:
                                c === 'transparent'
                                    ? 'repeating-linear-gradient(45deg,#eee 0 4px,#fff 4px 8px)'
                                    : c,
                        }}
                        onClick={() => onPatch({ backgroundColor: c })}
                        title={c}
                    />
                ))}
            </Row>
            <Row label="线宽">
                {STROKE_WIDTHS.map((w) => (
                    <button
                        key={w}
                        className={`chip chip--wide ${first.strokeWidth === w ? 'chip--active' : ''}`}
                        onClick={() => onPatch({ strokeWidth: w })}
                        title={`${w}px`}
                    >
                        {w}
                    </button>
                ))}
            </Row>
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="prop-panel__row">
            <span className="prop-panel__label">{label}</span>
            <div className="prop-panel__chips">{children}</div>
        </div>
    );
}
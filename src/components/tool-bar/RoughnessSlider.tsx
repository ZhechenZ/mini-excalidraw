import React from 'react';

interface RoughnessSliderProps {
  roughness: number;
  onChange: (value: number) => void;
}

export function RoughnessSlider({ roughness, onChange }: RoughnessSliderProps) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        userSelect: 'none',
        cursor: 'pointer',
      }}
    >
      <span>手绘强度</span>
      <input
        type="range"
        min={0}
        max={3}
        step={0.1}
        value={roughness}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ cursor: 'pointer' }}
      />
      <span style={{ width: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {roughness.toFixed(1)}
      </span>
    </label>
  );
}
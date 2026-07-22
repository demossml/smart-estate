import React from 'react';

interface RingChartProps {
  /** Значение 0–100 (процент заполнения кольца) */
  value: number;
  /** Максимальное значение для расчёта процента (если value уже 0–100, не используйте) */
  max?: number;
  /** Размер кольца в пикселях */
  size?: number;
  /** Толщина кольца в пикселях */
  strokeWidth?: number;
  /** Цвет кольца */
  color?: string;
  /** Цвет фона (трека) */
  trackColor?: string;
  /** Label под кольцом */
  label?: string;
  /** Значение внутри кольца */
  displayValue?: string;
  /** CSS класс для контейнера */
  className?: string;
}

/**
 * Apple Health-style ring chart.
 * SVG-based, spring animation via CSS transition on stroke-dashoffset.
 */
export function RingChart({
  value,
  max,
  size = 56,
  strokeWidth = 5,
  color = '#30d158',
  trackColor = 'rgba(255,255,255,0.08)',
  label,
  displayValue,
  className = '',
}: RingChartProps) {
  const pct = max ? Math.min(100, (value / max) * 100) : Math.min(100, value);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className={`flex flex-col items-center gap-0.5 ${className}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
        {/* Track (background ring) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* Foreground ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {/* Value inside */}
      {displayValue && (
        <span className="text-[10px] font-semibold font-mono text-text tabular-nums mt-0.5">
          {displayValue}
        </span>
      )}
      {/* Label below */}
      {label && (
        <span className="text-[8px] text-text-dim tracking-wide uppercase">{label}</span>
      )}
    </div>
  );
}

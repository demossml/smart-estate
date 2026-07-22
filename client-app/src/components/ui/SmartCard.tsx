import { StatusBadge } from './StatusBadge';
import { OverrideButton } from './OverrideButton';

interface SmartCardProps {
  name: string;
  icon: string;
  value?: string;
  status: 'auto' | 'override' | 'error';
  overrideUntil?: string;
  onToggle?: () => void;
  onOverride?: (minutes: number) => void;
  large?: boolean;
}

/**
 * Universal room/device card.
 * Shows icon, value, status badge, and optional override.
 * Touch target >= 56px. Tap toggles, long press = override.
 */
export function SmartCard({
  name, icon, value, status, overrideUntil,
  onToggle, onOverride, large,
}: SmartCardProps) {
  const statusColors = {
    auto: 'border-auto/30 bg-auto/5',
    override: 'border-override/40 bg-override/5',
    error: 'border-red/30 bg-red/5',
  };

  const label = overrideUntil
    ? `Ручной до ${overrideUntil}`
    : status === 'auto'
      ? 'По расписанию ✓'
      : undefined;

  return (
    <div
      className={`relative rounded-card border p-3 transition-all tap-active ${statusColors[status]}`}
      style={{ minWidth: 164, minHeight: large ? 160 : 124 }}
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={e => e.key === 'Enter' && onToggle?.()}
      aria-label={`${name}, ${value || ''}, ${label || status}`}
    >
      {/* Header: name */}
      <div className="text-sm font-bold text-text mb-2 truncate">{name}</div>

      {/* Center: big icon + value */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-3xl" aria-hidden="true">{icon}</span>
        {value && (
          <span className="font-mono text-2xl font-semibold text-text tabular-nums">
            {value}
          </span>
        )}
      </div>

      {/* Footer: status + override */}
      <div className="flex items-center justify-between mt-auto">
        <StatusBadge status={status} label={label} />
        {onOverride && (
          <OverrideButton roomName={name} onOverride={onOverride} />
        )}
      </div>
    </div>
  );
}

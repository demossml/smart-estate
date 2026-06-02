interface StatusBadgeProps {
  status: 'auto' | 'override' | 'error' | 'online' | 'offline';
  label?: string;
}

/** Small status indicator with label */
export function StatusBadge({ status, label }: StatusBadgeProps) {
  const config = {
    auto:    { dot: 'bg-auto',      text: 'text-auto',      defaultLabel: 'По расписанию ✓' },
    override:{ dot: 'bg-override',  text: 'text-override',  defaultLabel: 'Ручной' },
    error:   { dot: 'bg-red',       text: 'text-red',       defaultLabel: 'Ошибка' },
    online:  { dot: 'bg-green',     text: 'text-green',     defaultLabel: 'В сети' },
    offline: { dot: 'bg-text-dim',  text: 'text-text-dim',  defaultLabel: 'Нет связи' },
  }[status];

  return (
    <span className="inline-flex items-center gap-1.5 text-sm" role="status">
      <span className={`w-2 h-2 rounded-full ${config.dot}`} aria-hidden="true" />
      <span className={config.text}>{label || config.defaultLabel}</span>
    </span>
  );
}

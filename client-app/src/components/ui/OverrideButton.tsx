import { useState } from 'react';
import { Clock, Zap } from 'lucide-react';

interface OverrideButtonProps {
  roomName: string;
  onOverride: (minutes: number) => void;
  disabled?: boolean;
}

/**
 * Override button with duration picker.
 * Long press or tap opens a panel: 30 min / 1 hour / Until morning.
 */
export function OverrideButton({ roomName, onOverride, disabled }: OverrideButtonProps) {
  const [open, setOpen] = useState(false);

  const options = [
    { label: '30 мин', minutes: 30 },
    { label: '1 час', minutes: 60 },
    { label: 'До утра', minutes: 0 },
  ];

  const handleSelect = (minutes: number) => {
    onOverride(minutes);
    setOpen(false);
  };

  return (
    <div className="relative" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="tap-active flex items-center gap-1 px-3 py-1.5 rounded-btn bg-override-bg
                   text-override text-sm font-semibold hover:brightness-110 transition-all
                   disabled:opacity-40 min-h-[44px]"
        aria-label={`Override для ${roomName}`}
        aria-expanded={open}
      >
        <Zap size={16} />
        <span>Override</span>
      </button>

      {open && (
        <div
          className="absolute top-full right-0 mt-2 bg-surface rounded-card p-2 shadow-xl
                     border border-surface-hover z-50 min-w-[160px] animate-fade-in"
          role="menu"
        >
          {options.map(opt => (
            <button
              key={opt.label}
              onClick={() => handleSelect(opt.minutes)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg
                         text-text hover:bg-surface-hover transition-colors
                         min-h-[48px] text-left tap-active"
              role="menuitem"
            >
              <Clock size={16} className="text-text-dim" />
              <span className="text-sm">{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

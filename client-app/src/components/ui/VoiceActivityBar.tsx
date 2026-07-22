import { Mic, X, Check, Loader2 } from 'lucide-react';

interface VoiceActivityBarProps {
  open: boolean;
  text?: string;
  listening?: boolean;
  onCancel: () => void;
  onClose: () => void;
}

/**
 * Dynamic Island / Live Activity-style voice bar.
 * Скользит снизу как полоса на iPhone — blur, waveform, текст.
 * Сама закрывается через 3с после результата если не нажали.
 */
export function VoiceActivityBar({
  open, text, listening, onCancel, onClose,
}: VoiceActivityBarProps) {
  if (!open) return null;

  return (
    <div
      className="fixed left-0 right-0 z-50 animate-slide-up px-4"
      style={{ bottom: 'calc(68px + env(safe-area-bottom, 0px))' }}
      role="alert"
      aria-live="polite"
    >
      <div className="bg-surface/90 backdrop-blur-2xl rounded-2xl px-4 py-3.5
                      shadow-2xl shadow-black/50 border border-white/5">

        {/* Listening state */}
        {listening && (
          <div className="flex items-center gap-3">
            {/* Waveform animation */}
            <div className="flex items-center gap-0.5 h-6 shrink-0">
              <div className="w-0.5 bg-blue rounded-full animate-pulse" style={{ height: '14px', animationDelay: '0ms' }} />
              <div className="w-0.5 bg-blue rounded-full animate-pulse" style={{ height: '22px', animationDelay: '100ms' }} />
              <div className="w-0.5 bg-blue rounded-full animate-pulse" style={{ height: '10px', animationDelay: '200ms' }} />
              <div className="w-0.5 bg-blue rounded-full animate-pulse" style={{ height: '20px', animationDelay: '150ms' }} />
              <div className="w-0.5 bg-blue rounded-full animate-pulse" style={{ height: '16px', animationDelay: '50ms' }} />
            </div>
            <span className="text-sm text-text-dim flex-1">Слушаю...</span>
            <button
              onClick={onCancel}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center tap-active"
              aria-label="Отменить"
            >
              <X size={16} className="text-text-dim" />
            </button>
          </div>
        )}

        {/* Result state */}
        {text && !listening && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green/20 flex items-center justify-center shrink-0">
              <Check size={16} className="text-green" />
            </div>
            <span className="text-sm text-text flex-1 truncate">{text}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={onCancel}
                className="h-8 px-3 rounded-full bg-red/10 text-red text-xs font-semibold tap-active"
              >
                Отменить
              </button>
              <button
                onClick={onClose}
                className="h-8 px-4 rounded-full bg-blue text-white text-xs font-semibold tap-active"
              >
                Выполнить
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

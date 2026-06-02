import { Mic, Check, X } from 'lucide-react';

interface VoiceFeedbackSheetProps {
  open: boolean;
  text?: string;
  listening?: boolean;
  onCancel: () => void;
  onClose: () => void;
}

/**
 * Bottom sheet that appears after voice command.
 * Shows recognized text + confirmation + cancel button.
 */
export function VoiceFeedbackSheet({
  open, text, listening, onCancel, onClose,
}: VoiceFeedbackSheetProps) {
  if (!open) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up"
      role="alert"
      aria-live="polite"
    >
      <div className="safe-sheet bg-surface/95 backdrop-blur-xl border-t border-surface-hover
                      rounded-t-[20px] p-6">
        {/* Listening indicator */}
        {listening && (
          <div className="flex items-center justify-center gap-3 mb-4">
            <Mic size={24} className="text-blue animate-pulse" />
            <span className="text-lg text-text-dim">Слушаю...</span>
          </div>
        )}

        {/* Result */}
        {text && !listening && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <Check size={24} className="text-green" />
              <span className="text-lg text-text">{text}</span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-3 rounded-btn border border-red/30 text-red
                           font-semibold tap-active min-h-[48px] flex items-center justify-center gap-2"
              >
                <X size={18} />
                Отменить
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-btn bg-blue text-white
                           font-semibold tap-active min-h-[48px]"
              >
                OK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

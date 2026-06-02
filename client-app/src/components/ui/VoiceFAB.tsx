import { Mic } from 'lucide-react';

interface VoiceFABProps {
  listening?: boolean;
  onClick: () => void;
}

/**
 * Floating Action Button — microphone.
 * 64×64px, bottom-right, pulse animation while listening.
 */
export function VoiceFAB({ listening, onClick }: VoiceFABProps) {
  return (
    <button
      onClick={onClick}
      className={`safe-fab fixed w-16 h-16 rounded-fab bg-blue
                 flex items-center justify-center shadow-lg shadow-blue/30
                 tap-active transition-all z-40
                 ${listening ? 'fab-pulse scale-110' : 'hover:scale-105'}
                 min-h-[64px] min-w-[64px]`}
      aria-label={listening ? 'Слушаю...' : 'Голосовая команда'}
      role="button"
    >
      <Mic size={28} className="text-white" />
    </button>
  );
}

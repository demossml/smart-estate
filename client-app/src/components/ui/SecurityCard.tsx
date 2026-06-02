import { Shield, ShieldAlert } from 'lucide-react';
import { useState } from 'react';

interface SecurityCardProps {
  armed: boolean;
  openPoints: string[];
}

/**
 * Big security status card (100% width, 96px height).
 * Tap opens modal with door/window list.
 */
export function SecurityCard({ armed, openPoints }: SecurityCardProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`w-full rounded-card p-4 flex items-center gap-4 tap-active transition-colors
                   min-h-[96px] ${armed ? 'bg-green/10 border border-green/20' : 'bg-red/10 border border-red/20 animate-fade-in'}`}
        aria-label={`Охрана: ${armed ? 'Всё закрыто' : 'Открыто!'}`}
      >
        {armed ? (
          <Shield size={48} className="text-green" />
        ) : (
          <ShieldAlert size={48} className="text-red" />
        )}
        <div className="text-left flex-1">
          <div className={`text-xl font-bold ${armed ? 'text-green' : 'text-red'}`}>
            {armed ? 'Всё закрыто' : 'Открыто!'}
          </div>
          {!armed && (
            <div className="text-sm text-red/80 mt-1">
              Открыто: {openPoints.join(', ')}
            </div>
          )}
        </div>
      </button>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center"
          onClick={() => setShowModal(false)}
          role="dialog"
          aria-label="Статус охраны"
        >
          <div
            className="bg-surface rounded-t-card sm:rounded-card p-6 w-full sm:max-w-sm animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              {armed ? <Shield className="text-green" /> : <ShieldAlert className="text-red" />}
              Охрана
            </h2>
            <ul className="space-y-3">
              {openPoints.length === 0 ? (
                <li className="text-green flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green" /> Всё закрыто
                </li>
              ) : (
                openPoints.map(p => (
                  <li key={p} className="text-red flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red" /> {p}
                  </li>
                ))
              )}
            </ul>
            <button
              onClick={() => setShowModal(false)}
              className="mt-6 w-full py-3 bg-surface-hover rounded-btn text-text
                         font-semibold tap-active min-h-[48px]"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </>
  );
}

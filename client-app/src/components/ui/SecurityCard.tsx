import { useEffect, useState } from 'react';
import { ChevronDown, Shield, ShieldAlert, DoorClosed, DoorOpen, Lock, Unlock } from 'lucide-react';
import { api } from '../../api/client';
import { StatusBadge } from './StatusBadge';
import { logClient } from '../../lib/logger';

interface SecurityCardProps {
  openPoints: string[];
}

interface GateItem {
  ieee_addr: string;
  friendly_name: string;
  type: string;
  online: boolean;
  opened: boolean;
}

/**
 * Карточка охраны + ворота.
 * Свёрнута: зелёный/красный статус с иконкой щита.
 * Развёрнута: открытые точки + кнопки Открыть/Закрыть для ворот/калитки/замка.
 */
export function SecurityCard({ openPoints }: SecurityCardProps) {
  const [open, setOpen] = useState(false);
  const [gates, setGates] = useState<GateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<Record<string, 'open' | 'close' | null>>({});

  // Load gates when expanded
  useEffect(() => {
    if (!open) return;
    loadGates();
  }, [open]);

  const loadGates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/devices');
      const data = await res.json();
      const allDevices: any[] = data.devices || [];
      const gateItems: GateItem[] = allDevices
        .filter((d: any) => d.type === 'gate' || d.type === 'lock')
        .map((d: any) => {
          const stateTelemetry = (d.latest_telemetry || []).find((t: any) => t.property === 'state');
          return {
            ieee_addr: d.ieee_addr,
            friendly_name: d.friendly_name,
            type: d.type,
            online: d.status === 'online',
            opened: stateTelemetry ? stateTelemetry.value > 0 : false,
          };
        });
      setGates(gateItems);
    } catch {
      logClient('warn', 'SecurityCard: gates API недоступен');
    } finally {
      setLoading(false);
    }
  };

  const gateCommand = async (ieee: string, action: 'open' | 'close') => {
    setBusy(prev => ({ ...prev, [ieee]: action }));
    setGates(prev => prev.map(g =>
      g.ieee_addr === ieee ? { ...g, opened: action === 'open' } : g
    ));
    try {
      await (action === 'open' ? api.openGate(ieee) : api.closeGate(ieee));
    } catch {
      setGates(prev => prev.map(g =>
        g.ieee_addr === ieee ? { ...g, opened: action !== 'open' } : g
      ));
    } finally {
      setTimeout(() => setBusy(prev => ({ ...prev, [ieee]: null })), 500);
    }
  };

  // Combined status: red if anything open (doors or gates)
  const gatesOpen = gates.filter(g => g.opened);
  const hasOpenGates = gatesOpen.length > 0;
  const hasOpenDoors = openPoints.length > 0;
  const anythingOpen = hasOpenDoors || hasOpenGates;
  const allClosed = !anythingOpen;

  let headerBg = allClosed ? 'bg-green/10 border border-green/20' : 'bg-red/10 border border-red/20';
  let headerIcon = allClosed ? Shield : ShieldAlert;
  let headerIconColor = allClosed ? 'text-green' : 'text-red';
  let headerText = allClosed ? 'Всё закрыто' : 'Открыто!';
  let headerTextColor = allClosed ? 'text-green' : 'text-red';

  // Build open items summary for collapsed state
  const openSummary: string[] = [];
  if (hasOpenDoors) openSummary.push(...openPoints);
  if (hasOpenGates) openSummary.push(...gatesOpen.map(g => g.friendly_name));

  return (
    <div className={`bg-surface rounded-card overflow-hidden transition-all duration-300`}>
      {/* Header — tap to expand */}
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 px-4 py-4 min-h-[56px] text-left tap-active"
        aria-expanded={open}>
        <headerIcon size={open ? 24 : 28} className={`${headerIconColor} shrink-0 transition-all`} />
        <div className="flex-1 min-w-0">
          <div className={`font-bold ${open ? 'text-base' : 'text-lg'} ${headerTextColor}`}>
            {headerText}
          </div>
          {!allClosed && (
            <div className="text-xs text-red/70 mt-0.5 truncate">
              {openSummary.join(', ')}
            </div>
          )}
        </div>
        <ChevronDown size={18}
          className={`text-text-dim transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Body — expand/collapse */}
      {open && (
        <div className="px-4 pb-3 pt-0 border-t border-surface-hover/30 animate-fade-in">
          {/* Door sensors */}
          {hasOpenDoors && (
            <div className="mb-3 mt-2">
              <h3 className="text-xs font-semibold text-text-dim mb-2">Датчики открытия</h3>
              <div className="flex flex-col gap-1.5">
                {openPoints.map(p => (
                  <div key={p} className="flex items-center gap-2 text-red text-sm">
                    <span className="w-2 h-2 rounded-full bg-red shrink-0" />
                    <DoorOpen size={14} />
                    {p}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gate/lock controls */}
          <div className="mt-2">
            <h3 className="text-xs font-semibold text-text-dim mb-2">Ворота и замки</h3>
            {loading ? (
              <div className="text-xs text-text-dim py-2">Загрузка…</div>
            ) : gates.length === 0 ? (
              <div className="text-xs text-text-dim py-2">Нет устройств</div>
            ) : (
              <div className="flex flex-col gap-2">
                {gates.map(gate => {
                  const isClosing = busy[gate.ieee_addr] === 'close';
                  const isOpening = busy[gate.ieee_addr] === 'open';
                  const isBusy = isClosing || isOpening;

                  let tileBg = 'bg-bg';
                  if (gate.opened) tileBg = 'bg-green/5 border-green/20';
                  if (isClosing) tileBg = 'bg-amber-950/20';

                  const statusText = isClosing
                    ? 'Закрывается…'
                    : isOpening ? 'Открывается…' : gate.opened ? 'Открыто' : 'Закрыто';
                  const statusColor = gate.opened || isOpening ? 'text-green' : 'text-text-dim';

                  const StatusIcon = gate.opened ? DoorOpen : DoorClosed;

                  const openBtnClass = (isOpening || (gate.opened && !isBusy))
                    ? 'bg-blue text-white' : 'bg-transparent text-text-dim border border-surface-hover';
                  const closeBtnClass = (isClosing || (!gate.opened && !isBusy))
                    ? 'bg-red-600 text-white' : 'bg-transparent text-text-dim border border-surface-hover';

                  return (
                    <div key={gate.ieee_addr} className={`rounded-btn px-3 py-2.5 border transition-all ${tileBg}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <StatusIcon size={16} className={statusColor} />
                        <span className="text-sm font-medium text-text flex-1">{gate.friendly_name}</span>
                        <span className={`text-xs ${statusColor}`}>{statusText}</span>
                        <StatusBadge status={gate.online ? 'online' : 'offline'} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => gateCommand(gate.ieee_addr, 'open')} disabled={isBusy}
                          className={`min-h-[40px] rounded-btn text-xs font-semibold flex items-center justify-center gap-1 tap-active transition-all
                            ${openBtnClass} ${isBusy && !isOpening ? 'opacity-30' : ''}`}>
                          <Unlock size={12} /> Открыть
                        </button>
                        <button onClick={() => gateCommand(gate.ieee_addr, 'close')} disabled={isBusy}
                          className={`min-h-[40px] rounded-btn text-xs font-semibold flex items-center justify-center gap-1 tap-active transition-all
                            ${closeBtnClass} ${isBusy && !isClosing ? 'opacity-30' : ''}`}>
                          <Lock size={12} /> Закрыть
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

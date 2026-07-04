import { useEffect, useState } from 'react';
import { ChevronDown, DoorClosed, DoorOpen, Lock, Unlock, Shield } from 'lucide-react';
import { api } from '../../api/client';
import { StatusBadge } from './StatusBadge';
import { logClient } from '../../lib/logger';

interface GateItem {
  ieee_addr: string;
  friendly_name: string;
  type: string;
  online: boolean;
  opened: boolean;
}

const MOCK_GATES: GateItem[] = [
  { ieee_addr: 'gate-1', friendly_name: 'Въездные ворота', type: 'gate', online: true, opened: false },
  { ieee_addr: 'gate-2', friendly_name: 'Калитка', type: 'gate', online: true, opened: false },
  { ieee_addr: 'lock-1', friendly_name: 'Замок двери', type: 'lock', online: true, opened: false },
];

/**
 * Раскрывающаяся карточка ворот/замков на дашборде.
 * Свёрнута: цветной статус (зелёный/коричневый/красный).
 * Развёрнута: кнопки Открыть/Закрыть для каждых ворот/калитки/замка.
 */
export function GatesCard() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<GateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<Record<string, 'open' | 'close' | null>>({});

  // Load gate/lock devices with their telemetry state
  const loadItems = async () => {
    setLoading(true);
    try {
      // Use raw API — mapDevice drops latest_telemetry array
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
      setItems(gateItems);
      setOffline(false);
    } catch {
      setOffline(true);
      setItems(MOCK_GATES);
      logClient('warn', 'GatesCard: API недоступен');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open && items.length === 0) {
      loadItems();
    }
  }, [open]);

  const command = async (ieee: string, action: 'open' | 'close') => {
    setBusy(prev => ({ ...prev, [ieee]: action }));
    // Optimistic update
    setItems(prev => prev.map(it =>
      it.ieee_addr === ieee ? { ...it, opened: action === 'open' } : it
    ));
    try {
      await (action === 'open' ? api.openGate(ieee) : api.closeGate(ieee));
    } catch {
      // Revert
      setItems(prev => prev.map(it =>
        it.ieee_addr === ieee ? { ...it, opened: action !== 'open' } : it
      ));
    } finally {
      setTimeout(() => setBusy(prev => ({ ...prev, [ieee]: null })), 500);
    }
  };

  // Summary for collapsed header
  const gatesOpen = items.filter(i => i.type === 'gate' && i.opened);
  const locksOpen = items.filter(i => i.type === 'lock' && i.opened);
  const anyOpen = gatesOpen.length > 0 || locksOpen.length > 0;

  let summaryText: string;
  let summaryColor: string;
  let summaryBg: string;
  let SummaryIcon: typeof DoorClosed;

  if (gatesOpen.length > 0) {
    // Main gates or wicket open → RED
    summaryText = gatesOpen.map(g => g.friendly_name).join(', ') + ' — открыто';
    summaryColor = 'text-red';
    summaryBg = 'bg-red/10';
    SummaryIcon = DoorOpen;
  } else if (locksOpen.length > 0) {
    // Only lock open → AMBER
    summaryText = 'Замок открыт';
    summaryColor = 'text-amber-400';
    summaryBg = 'bg-amber-950/20';
    SummaryIcon = DoorOpen;
  } else {
    // All closed → GREEN
    summaryText = 'Всё закрыто';
    summaryColor = 'text-green';
    summaryBg = 'bg-green/5';
    SummaryIcon = DoorClosed;
  }

  return (
    <div className="bg-surface rounded-card border border-surface-hover overflow-hidden transition-all duration-300">
      {/* Header — always visible, coloured by state */}
      <button onClick={() => { setOpen(!open); if (!open && items.length === 0) loadItems(); }}
        className={`w-full flex items-center gap-3 px-4 py-3.5 min-h-[56px] text-left tap-active transition-colors ${summaryBg}`}
        aria-expanded={open}>
        <Shield size={22} className="text-blue shrink-0" />
        <span className="text-sm font-semibold text-text flex-1 truncate">Ворота и замки</span>
        <span className={`text-xs font-medium mr-1 flex items-center gap-1 ${summaryColor}`}>
          <SummaryIcon size={14} />
          {summaryText}
        </span>
        <ChevronDown size={18}
          className={`text-text-dim transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Body — expand/collapse */}
      {open && (
        <div className="px-4 pb-3 pt-0 border-t border-surface-hover animate-fade-in">
          {loading ? (
            <div className="py-4 text-sm text-text-dim text-center">Загрузка…</div>
          ) : offline ? (
            <p className="text-xs text-yellow py-2">офлайн — mock-данные</p>
          ) : null}

          <div className="flex flex-col gap-2 mt-2">
            {items.map((item) => {
              const isLock = item.type === 'lock';
              const isClosing = busy[item.ieee_addr] === 'close';
              const isOpening = busy[item.ieee_addr] === 'open';
              const isBusy = isClosing || isOpening;

              let tileBg = 'bg-bg';
              if (item.opened) tileBg = 'bg-green/5 border-green/20';
              if (isClosing) tileBg = 'bg-amber-950/20';
              if (isOpening) tileBg = 'bg-green/10';

              const statusText = isClosing
                ? (isLock ? 'Запирается…' : 'Закрывается…')
                : isOpening
                  ? (isLock ? 'Отпирается…' : 'Открывается…')
                  : item.opened ? 'Открыто' : 'Закрыто';
              const statusColor = item.opened || isOpening ? 'text-green' : isClosing ? 'text-amber-300' : 'text-amber-300';

              const StatusIcon = item.opened ? DoorOpen : DoorClosed;

              const openBtnClass = (isOpening || (item.opened && !isBusy))
                ? 'bg-blue text-white' : 'bg-transparent text-text-dim border border-surface-hover';
              const closeBtnClass = (isClosing || (!item.opened && !isBusy))
                ? 'bg-red-600 text-white' : 'bg-transparent text-text-dim border border-surface-hover';

              return (
                <div key={item.ieee_addr} className={`rounded-card px-3 py-3 border transition-all ${tileBg}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <StatusIcon size={20} className={statusColor} />
                    <span className="text-sm font-medium text-text flex-1">{item.friendly_name}</span>
                    <StatusBadge status={item.online ? 'online' : 'offline'} />
                  </div>
                  <p className={`text-xs mb-2 ${statusColor}`}>{statusText}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => command(item.ieee_addr, 'open')} disabled={isBusy}
                      className={`min-h-[44px] rounded-btn text-xs font-semibold flex items-center justify-center gap-1.5 tap-active transition-all
                        ${openBtnClass} ${isBusy && !isOpening ? 'opacity-40' : ''}`}>
                      <Unlock size={14} /> Открыть
                    </button>
                    <button onClick={() => command(item.ieee_addr, 'close')} disabled={isBusy}
                      className={`min-h-[44px] rounded-btn text-xs font-semibold flex items-center justify-center gap-1.5 tap-active transition-all
                        ${closeBtnClass} ${isBusy && !isClosing ? 'opacity-40' : ''}`}>
                      <Lock size={14} /> Закрыть
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

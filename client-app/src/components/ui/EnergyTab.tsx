import { useState, useEffect, useCallback, useMemo } from 'react';
import { Zap, Plug as PlugIcon } from 'lucide-react';
import { api } from '../../api/client';

interface EnergyTrendItem {
  hour: string;
  power: number;
  devices: number;
}

interface PlugData {
  ieee_addr: string;
  friendly_name: string;
  power: number;
  state: boolean;
}

export function EnergyTab() {
  const [trend, setTrend] = useState<EnergyTrendItem[]>([]);
  const [plugs, setPlugs] = useState<PlugData[]>([]);
  const [totalNow, setTotalNow] = useState(0);
  const [todayKwh, setTodayKwh] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [energyRes, trendRes, roomsRes] = await Promise.all([
        api.getEnergy().catch(() => ({ current_watts: 0, today_kwh: 0 })),
        fetch('/api/energy/trend').then(r => r.json()).catch(() => ({ trend: [] })),
        api.getDashboardV2().catch(() => ({ rooms: [] })),
      ]);

      setTotalNow(energyRes.current_watts || 0);
      setTodayKwh(energyRes.today_kwh || 0);
      setTrend(trendRes.trend || []);

      // Собираем все розетки из комнат
      const allPlugs: PlugData[] = [];
      for (const room of (roomsRes.rooms || [])) {
        for (const dev of (room.devices || [])) {
          if (dev.type === 'plug') {
            const stateTel = dev.latest_telemetry?.find((t: any) => t.property === 'state');
            const powerTel = dev.latest_telemetry?.find((t: any) => t.property === 'power');
            allPlugs.push({
              ieee_addr: dev.ieee_addr,
              friendly_name: dev.friendly_name || dev.ieee_addr?.slice(0, 12),
              power: powerTel?.value ?? 0,
              state: stateTel?.value === 1,
            });
          }
        }
      }
      setPlugs(allPlugs);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const maxTrend = useMemo(() => trend.length > 0 ? Math.max(...trend.map(t => t.power), 1) : 1, [trend]);

  if (loading) {
    return (
      <div className="p-4">
        <div className="text-[22px] font-[family-name:var(--font-cormorant)] text-text font-semibold mb-1">Энергопотребление</div>
        <div className="text-[12px] text-text-muted mb-4">Розетки и общий расход дома</div>
        <div className="glass-card p-8 text-center text-text-dim">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="text-[22px] font-[family-name:var(--font-cormorant)] text-text font-semibold mb-1">Энергопотребление</div>
      <div className="text-[12px] text-text-muted mb-4">Розетки и общий расход дома</div>

      <div className="glass-card p-6">
        <div className="se-energy-hero">
          <div className="se-energy-hero-num">{(totalNow / 1000).toFixed(2)}</div>
          <div className="se-energy-hero-unit">кВт сейчас</div>
        </div>

        <div className="se-hist">
          {trend.map((t, i) => (
            <div className="pc-hist-col" key={i}>
              <div
                className="pc-hist-bar"
                style={{
                  height: `${(t.power / maxTrend) * 100}%`,
                  background: 'linear-gradient(180deg,#C9A24B,#7A5C2E)',
                }}
              />
            </div>
          ))}
        </div>
        <div className="pc-hist-caption">кВт·ч, последние 24 ч</div>
      </div>

      {plugs.length === 0 ? (
        <div className="glass-card p-8 text-center text-text-dim mt-4">
          Нет розеток. Добавьте устройство типа "Розетка".
        </div>
      ) : (
        <div className="se-plug-list">
          <div className="text-[11px] font-[family-name:var(--font-cormorant)] text-text-dim uppercase tracking-wide mt-4 mb-2">Розетки</div>
          {plugs.map((p) => (
            <div className="se-plug-row" key={p.ieee_addr}>
              <PlugIcon size={15} strokeWidth={1.6} color={p.state ? '#7FE0A8' : '#5A5F58'} />
              <span className="se-plug-name">{p.friendly_name}</span>
              <span className="se-mono">{p.state ? p.power : 0} Вт</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

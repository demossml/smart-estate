import { useState, useEffect, useCallback, useContext, createContext, useRef, type ReactNode } from 'react';
import {
  Home, Lightbulb, Thermometer, DoorOpen, Timer, Shield,
  Wifi, WifiOff, Power, PowerOff, Flame, Snowflake, RefreshCw,
  AlertTriangle, CheckCircle, Droplets, Eye, Plug, ChevronRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
type Mode = 'demo' | 'live';
type Tab = 'dashboard' | 'devices' | 'climate' | 'gates' | 'scenarios' | 'events';

interface Room { id: number; name: string; icon: string; temperature: number; lightOn: boolean; status: string; }
interface DashboardData { rooms: Room[]; todayEnergy: number; security: { armed: boolean; openPoints: string[] }; nextEvent: string; energyTrend: 'up' | 'down' | 'stable'; }
interface Device { ieee_addr: string; friendly_name: string; type: string; status: string; room_id: number | null; latest_telemetry: { property: string; value: number; unit: string }[]; }
interface ClimateSetpoint { device_ieee: string; target_temp: number; current_temp: number; mode: string; action: string; hysteresis: number; min_temp: number; max_temp: number; }
interface Gate { ieee_addr: string; friendly_name: string; status: string; }
interface AccessLogEntry { ts: string; action: string; source: string; }
interface Scenario { id: number; name: string; description: string; active: boolean; }
interface EventsData { commands: any[]; errors: any[]; state_changes: any[]; }
interface StatusData { ok: boolean; devices: { total: number; online: number }; errors24h: number; }

interface AppState {
  mode: Mode; setMode: (m: Mode) => void;
  online: boolean;
  status: StatusData | null; dashboard: DashboardData | null;
  devices: Device[] | null; climate: ClimateSetpoint[] | null;
  gates: Gate[] | null; accessLog: AccessLogEntry[] | null;
  scenarios: Scenario[] | null; events: EventsData | null;
  refresh: () => void;
  toggleDevice: (ieee: string, isOn: boolean) => void;
  toggleGate: (ieee: string, action: 'open' | 'close') => void;
  toggleScenario: (id: number) => void;
  setClimate: (ieee: string, data: { target_temp?: number; mode?: string }) => void;
}

const AppContext = createContext<AppState>(null!);

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════
function getTelemetry(device: Device, property: string) {
  return device.latest_telemetry?.find(t => t.property === property);
}
function isDeviceOn(device: Device): boolean {
  const st = getTelemetry(device, 'state');
  return st ? st.value > 0 : false;
}
function isToggleable(device: Device): boolean {
  const t = device.type?.toLowerCase() || '';
  return t.includes('light') || t.includes('plug') || t.includes('switch') || t.includes('gate');
}

const ROOM_ICONS: Record<string, string> = {
  'гостиная':'🛋️','кухня':'🍳','спальня':'🛏️','ванная':'🛁','коридор':'🚪',
  'улица':'🌿','гараж':'🚗','кабинет':'💻','кладовая':'📦','балкон':'🌤️',
  'прихожая':'👞','детская':'🧸','туалет':'🚽','подвал':'⬇️','чердак':'⬆️',
};
function roomEmoji(name: string, icon?: string): string {
  const key = name.toLowerCase().trim();
  return ROOM_ICONS[key] || icon || '🏠';
}

function deviceIconEl(type: string) {
  const t = type.toLowerCase();
  if (t.includes('light')) return <Lightbulb className="w-5 h-5 text-yellow-400" />;
  if (t.includes('plug') || t.includes('socket')) return <Plug className="w-5 h-5 text-blue-400" />;
  if (t.includes('gate') || t.includes('door') || t.includes('lock')) return <DoorOpen className="w-5 h-5 text-[#8B949E]" />;
  if (t.includes('motion') || t.includes('pir') || t.includes('occupancy')) return <Eye className="w-5 h-5 text-purple-400" />;
  if (t.includes('leak') || t.includes('water') || t.includes('flood')) return <Droplets className="w-5 h-5 text-cyan-400" />;
  if (t.includes('co2') || t.includes('air')) return <Wind className="w-5 h-5 text-emerald-400" />;
  return <Thermometer className="w-5 h-5 text-orange-400" />;
}

import { Wind } from 'lucide-react';
import { ErrorBoundary } from '@/lib/ErrorBoundary';
import { DebugPanel } from '@/lib/DebugPanel';
import { initLogger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════
// Toast
// ═══════════════════════════════════════════════════════════════
interface Toast { id: number; message: string; type: 'success' | 'error'; }
let toastId = 0;
function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[90%] max-w-sm pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`animate-slideUp px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${t.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Skeleton
// ═══════════════════════════════════════════════════════════════
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-[#21262D] animate-pulse rounded-xl ${className}`} />;
}
function LoadingSkeleton() {
  return <div className="space-y-4 px-1">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}</div>;
}

// ═══════════════════════════════════════════════════════════════
// Shared
// ═══════════════════════════════════════════════════════════════
function EmptyState({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4">{icon}</div>
      <p className="text-[#8B949E] font-medium text-base">{title}</p>
      {subtitle && <p className="text-xs text-[#484F58] mt-1.5">{subtitle}</p>}
    </div>
  );
}
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <AlertTriangle className="w-14 h-14 text-red-400 mb-4" />
      <p className="text-[#8B949E] font-semibold text-lg">⚠️ Сервер не отвечает</p>
      <p className="text-xs text-[#484F58] mt-1 mb-6">Проверьте подключение</p>
      <Button variant="outline" onClick={onRetry} className="active:scale-[0.97] transition-transform">
        <RefreshCw className="w-4 h-4 mr-2" /> Повторить
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Hooks
// ═══════════════════════════════════════════════════════════════
function useApi() {
  const [state, setState] = useState<{
    online: boolean; status: StatusData | null; dashboard: DashboardData | null;
    devices: Device[] | null; climate: ClimateSetpoint[] | null;
    gates: Gate[] | null; accessLog: AccessLogEntry[] | null;
    scenarios: Scenario[] | null; events: EventsData | null;
  }>({ online: true, status: null, dashboard: null, devices: null, climate: null, gates: null, accessLog: null, scenarios: null, events: null });

  const fetchAll = useCallback(async () => {
    try {
      const [status, dash, devs, clim, gatesRes, log, scen, evts] = await Promise.all([
        fetch('/api/status').then(r => r.json()).catch(() => null),
        fetch('/api/dashboard').then(r => r.json()).catch(() => null),
        fetch('/api/devices').then(r => r.json()).catch(() => null),
        fetch('/api/climate').then(r => r.json()).catch(() => null),
        fetch('/api/gates').then(r => r.json()).catch(() => null),
        fetch('/api/gates/access-log').then(r => r.json()).catch(() => null),
        fetch('/api/scenarios').then(r => r.json()).catch(() => null),
        fetch('/api/events').then(r => r.json()).catch(() => null),
      ]);
      setState({
        online: true,
        status, dashboard: dash,
        devices: devs?.devices ?? null,
        climate: clim?.setpoints ?? null,
        gates: gatesRes?.gates ?? null,
        accessLog: log?.log ?? null,
        scenarios: scen?.scenarios ?? null,
        events: evts ?? null,
      });
    } catch {
      setState(s => ({ ...s, online: false }));
    }
  }, []);

  useEffect(() => { fetchAll(); const i = setInterval(fetchAll, 5000); return () => clearInterval(i); }, [fetchAll]);
  return { ...state, refresh: fetchAll };
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════
function StatTile({ icon, label, value, sub, onClick }: { icon: ReactNode; label: string; value: string; sub: string; onClick?: () => void }) {
  return (
    <Card className="bg-[#1a2332] border-[rgba(255,255,255,0.05)] cursor-pointer active:scale-[0.97] transition-all duration-150 hover:border-[rgba(255,255,255,0.1)]" onClick={onClick}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-[#8B949E] text-xs mb-2">{icon}<span className="font-medium">{label}</span></div>
        <div className="font-mono text-2xl font-bold text-[#E6EDF3]">{value}</div>
        <div className="text-[11px] text-[#8B949E] mt-1">{sub}</div>
      </CardContent>
    </Card>
  );
}

function DashboardScreen() {
  const { dashboard, devices: devs, setMode } = useContext(AppContext);
  if (!dashboard) return <LoadingSkeleton />;
  const { rooms, todayEnergy, security, nextEvent, energyTrend } = dashboard;
  const lights = devs?.filter(d => d.type?.toLowerCase().includes('light')) ?? [];
  const lightsOn = lights.filter(d => isDeviceOn(d)).length;
  const avgTemp = rooms.length ? rooms.reduce((s, r) => s + r.temperature, 0) / rooms.length : 0;

  return (
    <div className="space-y-5 pb-2">
      {/* 2x2 stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={<Thermometer className="w-5 h-5 text-orange-400" />} label="Температура" value={`${avgTemp.toFixed(1)}°C`} sub={energyTrend === 'up' ? '↑ Растёт' : energyTrend === 'down' ? '↓ Падает' : '→ Стабильно'} />
        <StatTile icon={<Lightbulb className="w-5 h-5 text-yellow-400" />} label="Освещение" value={`${lightsOn}/${lights.length}`} sub={`${lightsOn} вкл.`} />
        <StatTile icon={<Power className="w-5 h-5 text-blue-400" />} label="Энергия" value={`${todayEnergy.toFixed(1)}`} sub="кВт⋅ч сегодня" />
        <StatTile icon={<Shield className="w-5 h-5 text-emerald-400" />} label="Охрана" value={security.armed ? '🟢' : '🔴'} sub={security.armed ? 'Под охраной' : 'Снято'} />
      </div>

      {/* Climate preview */}
      <Card className="bg-[#161B22] border-[rgba(255,255,255,0.06)]">
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Thermometer className="w-4 h-4 text-orange-400" /> Климат</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-5 overflow-x-auto pb-2">
            {rooms.slice(0, 4).map(r => (
              <div key={r.id} className="flex-shrink-0 text-center min-w-[72px]">
                <div className="text-2xl mb-1.5">{roomEmoji(r.name, r.icon)}</div>
                <div className="text-[11px] text-[#8B949E] mb-1 truncate max-w-[72px]">{r.name}</div>
                <div className="font-mono text-lg font-semibold text-[#E6EDF3]">{r.temperature?.toFixed?.(1) ?? '—'}°</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Lights */}
      <Card className="bg-[#161B22] border-[rgba(255,255,255,0.06)]">
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Lightbulb className="w-4 h-4 text-yellow-400" /> Освещение</CardTitle></CardHeader>
        <CardContent>
          <p className="text-2xl font-mono font-bold mb-4">{lightsOn} <span className="text-base font-normal text-[#8B949E]">вкл.</span></p>
          <Button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-12 text-base active:scale-[0.97] transition-transform rounded-xl"
            onClick={async () => {
              const toOff = lights.filter(d => isDeviceOn(d));
              await Promise.all(toOff.map(l => fetch(`/api/devices/${l.ieee_addr}/off`, { method: 'POST' }).catch(() => {})));
              setTimeout(() => window.location.reload(), 500);
            }}>
            <PowerOff className="w-4 h-4 mr-2" /> ВЫКЛЮЧИТЬ ВЕСЬ СВЕТ
          </Button>
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="bg-[#161B22] border-[rgba(255,255,255,0.06)]">
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-400" /> Безопасность</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-1">
            <span className={`w-3 h-3 rounded-full ${security.armed ? 'bg-emerald-400 animate-pulse-dot' : 'bg-red-400'}`} />
            <span className="font-semibold text-[#E6EDF3]">{security.armed ? '● НА СВЯЗИ' : '⚠️ ТРЕВОГА'}</span>
          </div>
          {security.openPoints.length > 0 && <p className="text-xs text-red-400 mt-2">Открыто: {security.openPoints.join(', ')}</p>}
          {nextEvent && <p className="text-xs text-[#8B949E] mt-2">Следующее: {nextEvent}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DEVICES
// ═══════════════════════════════════════════════════════════════
function DevicesScreen() {
  const { devices: devs } = useContext(AppContext);
  const [filter, setFilter] = useState<'all' | 'on' | 'off'>('all');
  if (!devs) return <LoadingSkeleton />;

  const filtered = filter === 'all' ? devs : devs.filter(d => {
    const on = isDeviceOn(d);
    return filter === 'on' ? on : !on;
  });

  // Group by room
  const grouped = new Map<string, Device[]>();
  for (const d of filtered) {
    const key = String(d.room_id ?? 'none');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(d);
  }

  return (
    <div className="space-y-4 pb-2">
      <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'on' | 'off')}>
        <TabsList className="w-full bg-[#161B22] p-1 rounded-xl">
          <TabsTrigger value="all" className="flex-1 rounded-lg text-xs">Все</TabsTrigger>
          <TabsTrigger value="on" className="flex-1 rounded-lg text-xs">🟢 Вкл</TabsTrigger>
          <TabsTrigger value="off" className="flex-1 rounded-lg text-xs">🔴 Выкл</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyState icon={<Lightbulb className="w-12 h-12 text-[#484F58]" />} title="Нет устройств" subtitle="Подключите устройства через Zigbee" />
      ) : (
        <div className="space-y-5">
          {[...grouped.entries()].map(([rid, ds]) => {
            const roomName = rid !== 'none' ? (devs.find(d => String(d.room_id) === rid)?.friendly_name?.split(' ')?.[0] ?? `Комната ${rid}`) : 'Без комнаты';
            return (
              <div key={rid}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className="text-lg">{roomEmoji(roomName)}</span>
                  <span className="text-sm font-semibold text-[#E6EDF3]">{roomName}</span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">{ds.length} устр.</Badge>
                </div>
                <div className="space-y-2">{ds.map(d => <DeviceTile key={d.ieee_addr} device={d} />)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DeviceTile({ device: d }: { device: Device }) {
  const { toggleDevice } = useContext(AppContext);
  const isOn = isDeviceOn(d);
  const toggleable = isToggleable(d);
  const temp = getTelemetry(d, 'temperature');
  const hum = getTelemetry(d, 'humidity');
  const power = getTelemetry(d, 'power');
  const co2 = getTelemetry(d, 'co2');
  const occ = getTelemetry(d, 'occupancy');
  const leak = getTelemetry(d, 'water_leak');

  const meta: string[] = [];
  if (temp) meta.push(`${temp.value}${temp.unit}`);
  if (hum) meta.push(`${hum.value}%`);
  if (power) meta.push(`${power.value}W`);
  if (co2) meta.push(`${co2.value}ppm`);
  if (occ !== undefined) meta.push(occ > 0 ? '👤 Движение' : '○ Пусто');
  if (leak !== undefined) meta.push(leak > 0 ? '⚠️ Протечка' : '✅ Сухо');
  if (!meta.length && toggleable) meta.push(isOn ? 'ВКЛ' : 'ВЫКЛ');

  return (
    <Card className="bg-[#1a2332] border-[rgba(255,255,255,0.04)] active:scale-[0.98] transition-all duration-150">
      <CardContent className="p-3.5 flex items-center gap-3">
        {deviceIconEl(d.type)}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[#E6EDF3] truncate">{d.friendly_name}</div>
          <div className="text-[11px] text-[#8B949E] font-mono truncate mt-0.5">{meta.join(' · ') || d.type}</div>
        </div>
        {toggleable ? (
          <Toggle pressed={isOn} onPressedChange={() => toggleDevice(d.ieee_addr, isOn)} />
        ) : (
          <span className="font-mono text-sm font-semibold text-[#00B4FF] flex-shrink-0">
            {temp ? `${temp.value}°` : power ? `${power.value}W` : co2 ? `${co2.value}` : d.status}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// CLIMATE
// ═══════════════════════════════════════════════════════════════
function ClimateScreen() {
  const { climate, setClimate } = useContext(AppContext);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [localTemps, setLocalTemps] = useState<Record<string, number>>({});
  
  if (!climate) return <LoadingSkeleton />;
  if (!climate.length) return <EmptyState icon={<Thermometer className="w-12 h-12 text-[#484F58]" />} title="Нет климат-устройств" subtitle="Добавьте термостаты через Zigbee" />;

  const handleTempChange = useCallback((ieee: string, value: number) => {
    // Update local state immediately for smooth slider
    setLocalTemps(prev => ({ ...prev, [ieee]: value }));
    
    // Debounce the API call
    if (debounceTimers.current[ieee]) clearTimeout(debounceTimers.current[ieee]);
    debounceTimers.current[ieee] = setTimeout(() => {
      setClimate(ieee, { target_temp: value });
    }, 400);
  }, [setClimate]);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = debounceTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  return (
    <div className="space-y-4 pb-2">
      {climate.map(c => {
        const diff = Math.abs((c.current_temp ?? 0) - (c.target_temp ?? 0));
        const inRange = diff <= (c.hysteresis || 1);
        const isHeating = c.action === 'heat' || c.action === 'heating';
        const isCooling = c.action === 'cool' || c.action === 'cooling';
        const statusLabel = inRange ? '✅ В норме' : isHeating ? '🔥 Нагрев' : isCooling ? '❄️ Охлаждение' : '—';
        const statusColor = inRange ? 'bg-emerald-600' : isHeating ? 'bg-orange-600' : 'bg-blue-600';
        const StatusIcon = inRange ? CheckCircle : isHeating ? Flame : Snowflake;
        const displayTemp = localTemps[c.device_ieee] ?? c.target_temp;

        return (
          <Card key={c.device_ieee} className="bg-[#161B22] border-[rgba(255,255,255,0.06)]">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-[#8B949E] mb-1 font-mono">{c.device_ieee.slice(-8)}</div>
                  <div className="text-4xl font-mono font-bold text-[#E6EDF3]">{c.current_temp?.toFixed?.(1) ?? '—'}°</div>
                </div>
                <Badge className={`${statusColor} text-white text-[11px] px-3 py-1.5`}>
                  <StatusIcon className="w-3 h-3 mr-1.5" />{statusLabel}
                </Badge>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-xs text-[#8B949E]">
                  <span>Уставка: <span className="font-mono font-semibold text-[#E6EDF3]">{displayTemp?.toFixed?.(1) ?? '—'}°C</span></span>
                  <span className="font-mono">{c.min_temp}° – {c.max_temp}°</span>
                </div>
                <Slider min={c.min_temp ?? 16} max={c.max_temp ?? 30} step={0.5} value={displayTemp ?? 22} onValueChange={(v) => handleTempChange(c.device_ieee, v)} />
                <div className="text-center font-mono text-sm font-semibold text-[#00B4FF]">{displayTemp?.toFixed?.(1) ?? '—'}°C</div>
              </div>

              <div className="flex gap-2 pt-1">
                {(['heat', 'cool', 'auto'] as const).map(m => (
                  <Button key={m} size="sm" variant={c.mode === m ? 'default' : 'outline'}
                    className={`flex-1 text-xs h-9 rounded-lg active:scale-[0.97] transition-transform ${c.mode === m ? 'bg-[#00B4FF] hover:bg-[#00B4FF]/90' : 'border-[rgba(255,255,255,0.1)] text-[#8B949E]'}`}
                    onClick={() => setClimate(c.device_ieee, { mode: m })}>
                    {m === 'heat' ? <Flame className="w-3 h-3 mr-1" /> : m === 'cool' ? <Snowflake className="w-3 h-3 mr-1" /> : null}
                    {m === 'heat' ? 'Обогрев' : m === 'cool' ? 'Охлаждение' : 'Авто'}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// GATES
// ═══════════════════════════════════════════════════════════════
function GatesScreen() {
  const { gates, accessLog, toggleGate } = useContext(AppContext);
  if (!gates) return <LoadingSkeleton />;

  return (
    <div className="space-y-4 pb-2">
      {gates.length === 0 ? (
        <EmptyState icon={<DoorOpen className="w-12 h-12 text-[#484F58]" />} title="Нет ворот" />
      ) : gates.map(g => {
        const isClosed = g.status === 'closed' || g.status === 'offline';
        return (
          <Card key={g.ieee_addr} className="bg-[#161B22] border-[rgba(255,255,255,0.06)]">
            <CardContent className="p-5 text-center space-y-4">
              <DoorOpen className="w-12 h-12 text-[#8B949E] mx-auto" />
              <div>
                <div className="font-semibold text-lg text-[#E6EDF3]">{g.friendly_name}</div>
                <div className="text-sm text-[#8B949E] mt-1">
                  {g.status === 'closed' ? '🔒 ЗАКРЫТО' : g.status === 'open' ? '🔓 ОТКРЫТО' : `⚠️ ${g.status}`}
                </div>
              </div>
              <Button size="lg" variant={isClosed ? 'default' : 'destructive'}
                className={`w-full h-14 text-base font-bold rounded-xl active:scale-[0.97] transition-transform ${isClosed ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'}`}
                onClick={() => toggleGate(g.ieee_addr, isClosed ? 'open' : 'close')}>
                {isClosed ? '🔓 Открыть' : '🔒 Закрыть'}
              </Button>
            </CardContent>
          </Card>
        );
      })}

      {accessLog && accessLog.length > 0 && (
        <Card className="bg-[#161B22] border-[rgba(255,255,255,0.06)]">
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2">📋 Журнал доступа</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {accessLog.slice(0, 30).map((e, i) => {
                const d = new Date(e.ts);
                const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
                const showDate = i === 0 || new Date(accessLog[i - 1]?.ts).toDateString() !== d.toDateString();
                return (
                  <div key={i}>
                    {showDate && <div className="text-[10px] text-[#484F58] font-semibold mb-2 mt-3 first:mt-0">{date}</div>}
                    <div className="flex items-center gap-3 text-sm py-1">
                      <span className="font-mono text-xs text-[#8B949E] w-12 flex-shrink-0">{time}</span>
                      <span className="flex-1 text-[#E6EDF3]">{e.action === 'open' ? '🔓 Открыто' : '🔒 Закрыто'}</span>
                      <span className="text-xs text-[#484F58]">{e.source || '—'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCENARIOS
// ═══════════════════════════════════════════════════════════════
function ScenariosScreen() {
  const { scenarios, toggleScenario } = useContext(AppContext);
  if (!scenarios) return <LoadingSkeleton />;
  if (!scenarios.length) return <EmptyState icon={<Timer className="w-12 h-12 text-[#484F58]" />} title="Нет сценариев" subtitle="Создайте сценарии автоматизации" />;

  return (
    <div className="space-y-3 pb-2">
      {scenarios.map(s => (
        <Card key={s.id} className={`bg-[#161B22] transition-all duration-200 ${s.active ? 'border-emerald-500/30 ring-1 ring-emerald-500/20' : 'border-[rgba(255,255,255,0.04)] opacity-60'}`}>
          <CardContent className="p-4 flex items-center gap-4">
            <span className={`w-3 h-3 rounded-full flex-shrink-0 ${s.active ? 'bg-emerald-400' : 'bg-[#484F58]'}`} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-[#E6EDF3]">{s.name}</div>
              {s.description && <div className="text-xs text-[#8B949E] truncate mt-0.5">{s.description}</div>}
            </div>
            <Toggle pressed={s.active} onPressedChange={() => toggleScenario(s.id)} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════
function EventsScreen() {
  const { events } = useContext(AppContext);
  if (!events) return <LoadingSkeleton />;

  const merged = [
    ...(events.commands || []).map((e: any) => ({ ...e, _type: 'cmd' as const, _ts: e.sent_at || e.ts || '' })),
    ...(events.state_changes || []).map((e: any) => ({ ...e, _type: 'state' as const, _ts: e.ts || '' })),
    ...(events.errors || []).map((e: any) => ({ ...e, _type: 'error' as const, _ts: e.ts || '' })),
  ].sort((a, b) => new Date(b._ts).getTime() - new Date(a._ts).getTime()).slice(0, 50);

  const dotColors: Record<string, string> = { cmd: 'bg-blue-400', state: 'bg-yellow-400', error: 'bg-red-400' };

  return (
    <div className="space-y-3 pb-2">
      <div className="flex items-center gap-3 text-base mb-4">
        <Shield className="w-5 h-5 text-emerald-400" />
        <span className="font-semibold text-[#E6EDF3]">🟢 Дом под охраной</span>
      </div>

      {merged.length === 0 ? (
        <EmptyState icon={<Shield className="w-12 h-12 text-[#484F58]" />} title="Всё спокойно" subtitle="Нет событий за последние 24 часа" />
      ) : (
        <Card className="bg-[#161B22] border-[rgba(255,255,255,0.06)]">
          <CardContent className="p-3">
            <div className="space-y-0">
              {merged.map((e, i) => {
                const d = new Date(e._ts);
                const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
                const showDate = i === 0 || new Date(merged[i - 1]._ts).toDateString() !== d.toDateString();
                let label = '';
                if (e._type === 'cmd') label = `${e.command || '?'} → ${e.device_ieee || '?'}`;
                else if (e._type === 'state') label = `${e.from_state || '?'} → ${e.to_state || '?'}: ${e.device_ieee || '?'}`;
                else label = e.message || e.error || 'Неизвестная ошибка';

                return (
                  <div key={i}>
                    {showDate && <div className="text-[11px] text-[#484F58] font-semibold py-2 mt-1 first:mt-0">{date}</div>}
                    <div className="flex items-start gap-3 py-1.5">
                      <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dotColors[e._type] || 'bg-[#484F58]'}`} />
                      <span className="font-mono text-[11px] text-[#8B949E] w-16 flex-shrink-0">{time}</span>
                      <span className="text-xs text-[#E6EDF3] flex-1 break-all leading-relaxed">{label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB BAR
// ═══════════════════════════════════════════════════════════════
const TABS: { key: Tab; label: string; icon: typeof Home }[] = [
  { key: 'dashboard', label: 'Главная', icon: Home },
  { key: 'devices', label: 'Устройства', icon: Lightbulb },
  { key: 'climate', label: 'Климат', icon: Thermometer },
  { key: 'gates', label: 'Ворота', icon: DoorOpen },
  { key: 'scenarios', label: 'Сценарии', icon: Timer },
  { key: 'events', label: 'События', icon: Shield },
];

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="flex-shrink-0 bg-[#161B22] border-t border-[rgba(255,255,255,0.06)] flex" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {TABS.map(t => {
        const isActive = active === t.key;
        return (
          <button key={t.key} onClick={() => onChange(t.key)}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors relative ${
              isActive ? 'text-[#00B4FF]' : 'text-[#484F58] hover:text-[#8B949E]'
            }`}>
            {isActive && <div className="absolute top-0 left-3 right-3 h-0.5 bg-[#00B4FF] rounded-full" />}
            <t.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
            <span className="text-[10px] leading-none font-medium">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════
// PWA INSTALL SCREEN
// ═══════════════════════════════════════════════════════════════
function InstallScreen({ onInstall }: { onInstall: () => void }) {
  const [deferred, setDeferred] = useState<any>(null);
  const [showIOS, setShowIOS] = useState(false);

  useEffect(() => {
    // Android/Desktop: beforeinstallprompt
    const handler = (e: any) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS: check if Safari
    const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    if (isIOS && !isStandalone) setShowIOS(true);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (deferred) {
      deferred.prompt();
      const result = await deferred.userChoice;
      if (result.outcome === 'accepted') onInstall();
      setDeferred(null);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center bg-[#0D1117] px-6 text-center">
      <div className="mb-8">
        <div className="w-24 h-24 mx-auto bg-gradient-to-br from-[#00B4FF] to-[#00FF9D] rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-[#00B4FF]/20">
          <Home className="w-14 h-14 text-[#0D1117]" strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-bold text-[#E6EDF3] mb-2">Умная Усадьба</h1>
        <p className="text-[#8B949E] text-sm leading-relaxed max-w-xs">
          Управляйте домом с телефона: свет, климат, ворота, охрана — всё в одном приложении
        </p>
      </div>

      <div className="w-full max-w-xs space-y-3">
        {deferred ? (
          <Button size="lg" className="w-full h-14 text-base font-bold rounded-xl bg-gradient-to-r from-[#00B4FF] to-[#00FF9D] text-[#0D1117] active:scale-[0.97] transition-transform"
            onClick={install}>
            Установить приложение
          </Button>
        ) : showIOS ? (
          <div className="bg-[#161B22] rounded-xl p-5 border border-[rgba(255,255,255,0.06)]">
            <p className="text-[#E6EDF3] text-sm font-semibold mb-3">📱 Как установить на iPhone</p>
            <div className="flex items-center gap-3 text-xs text-[#8B949E] leading-relaxed">
              <span className="text-lg flex-shrink-0">1.</span>
              <span>Нажмите <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#21262D] rounded text-[#00B4FF] text-xs"><ShareIcon className="w-3 h-3" />Поделиться</span> в Safari</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-[#8B949E] leading-relaxed mt-2">
              <span className="text-lg flex-shrink-0">2.</span>
              <span>Выберите <strong className="text-[#E6EDF3]">«На экран Домой»</strong></span>
            </div>
            <div className="flex items-center gap-3 text-xs text-[#8B949E] leading-relaxed mt-2">
              <span className="text-lg flex-shrink-0">3.</span>
              <span>Нажмите <strong className="text-[#E6EDF3]">«Добавить»</strong></span>
            </div>
          </div>
        ) : (
          <div className="bg-[#161B22] rounded-xl p-5 border border-[rgba(255,255,255,0.06)]">
            <p className="text-[#8B949E] text-sm">Откройте в Chrome чтобы установить приложение</p>
          </div>
        )}
      </div>

      <p className="text-[10px] text-[#484F58] mt-8">Версия 2.0 · PWA · Офлайн-режим</p>
    </div>
  );
}

// Share icon for iOS instructions
function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const api = useApi();
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem('smarthome-mode') as Mode) || 'demo');
  const [tab, setTab] = useState<Tab>('dashboard');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [installed, setInstalled] = useState<boolean>(() => {
    // Check if running as installed PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    const urlParams = new URLSearchParams(window.location.search);
    return isStandalone || urlParams.get('pwa') === '1' || localStorage.getItem('pwa-installed') === '1';
  });

  // Init debug logger on first mount
  useEffect(() => { initLogger(); }, []);

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++toastId;
    setToasts(t => [...t.slice(-4), { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);

  const toggleMode = useCallback(async () => {
    const next: Mode = mode === 'demo' ? 'live' : 'demo';
    try { await fetch('/api/mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: next }) }); } catch {}
    setMode(next);
    localStorage.setItem('smarthome-mode', next);
    addToast(`Режим: ${next === 'live' ? '🟢 LIVE' : '🧪 DEMO'}`, 'success');
    api.refresh();
  }, [mode, api, addToast]);

  const toggleDevice = useCallback(async (ieee: string, isOn: boolean) => {
    const next = isOn ? 'off' : 'on';
    try { 
      await fetch(`/api/devices/${ieee}/${next}`, { method: 'POST' });
      addToast(`${next === 'on' ? '✅ Включено' : '○ Выключено'}`, 'success');
      // Delay refresh slightly to let animation finish
      setTimeout(() => api.refresh(), 300);
    } catch { addToast('Ошибка', 'error'); }
  }, [api, addToast]);

  const toggleGate = useCallback(async (ieee: string, action: 'open' | 'close') => {
    try { 
      await fetch(`/api/gates/${ieee}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'manual' }) });
      addToast(action === 'open' ? '🔓 Ворота открываются' : '🔒 Ворота закрываются', 'success');
      setTimeout(() => api.refresh(), 300);
    } catch { addToast('Ошибка', 'error'); }
  }, [api, addToast]);

  const toggleScenario = useCallback(async (id: number) => {
    try { 
      await fetch(`/api/scenarios/${id}/toggle`, { method: 'POST' });
      addToast('Сценарий переключён', 'success');
      setTimeout(() => api.refresh(), 300);
    } catch { addToast('Ошибка', 'error'); }
  }, [api, addToast]);

  const setClimate = useCallback(async (ieee: string, data: { target_temp?: number; mode?: string }) => {
    // Mode change: immediate toast + refresh
    // Temp change: silent (debounced by slider), no toast
    const isModeChange = data.mode !== undefined;
    try { 
      await fetch(`/api/climate/${ieee}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (isModeChange) {
        addToast(`✅ Режим: ${data.mode === 'heat' ? '🔥 Обогрев' : data.mode === 'cool' ? '❄️ Охлаждение' : '🔄 Авто'}`, 'success');
        setTimeout(() => api.refresh(), 300);
      }
      // Temp-only changes: no toast, no refresh (polling syncs)
    } catch { addToast('Ошибка', 'error'); }
  }, [api, addToast]);

  const ctx: AppState = {
    mode, setMode, online: api.online, status: api.status, dashboard: api.dashboard,
    devices: api.devices, climate: api.climate, gates: api.gates, accessLog: api.accessLog,
    scenarios: api.scenarios, events: api.events, refresh: api.refresh,
    toggleDevice, toggleGate, toggleScenario, setClimate,
  };

  const renderScreen = () => {
    if (!api.online && !api.status) return <ErrorState onRetry={api.refresh} />;
    switch (tab) {
      case 'dashboard': return <DashboardScreen />;
      case 'devices': return <DevicesScreen />;
      case 'climate': return <ClimateScreen />;
      case 'gates': return <GatesScreen />;
      case 'scenarios': return <ScenariosScreen />;
      case 'events': return <EventsScreen />;
    }
  };

  const handleInstall = useCallback(() => {
    setInstalled(true);
    localStorage.setItem('pwa-installed', '1');
  }, []);

  // Show install screen if not installed as PWA
  if (!installed) {
    return (
      <ErrorBoundary>
        <InstallScreen onInstall={handleInstall} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
    <AppContext.Provider value={ctx}>
      <div className="h-full flex flex-col bg-[#0D1117]">
        {/* Header */}
        <header className="flex-shrink-0 bg-[#161B22] border-b border-[rgba(255,255,255,0.06)] px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight text-[#E6EDF3]">🏠 Умная Усадьба</h1>
            <span className={`w-2.5 h-2.5 rounded-full ${api.online ? 'bg-emerald-400 animate-pulse-dot' : 'bg-red-400'}`} />
          </div>
          <button onClick={toggleMode} className="active:scale-[0.95] transition-transform">
            <Badge variant={mode === 'live' ? 'default' : 'secondary'} className="cursor-pointer text-xs font-medium px-3 py-1">
              {mode === 'live' ? '🟢 LIVE' : '🧪 DEMO'}
            </Badge>
          </button>
        </header>

        {/* Offline banner */}
        {!api.online && (
          <div className="flex-shrink-0 bg-red-600 text-white text-xs text-center py-2 px-4 flex items-center justify-center gap-2 font-medium">
            <WifiOff className="w-3.5 h-3.5" /> Нет соединения с сервером
          </div>
        )}

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-5 py-5 scroll-container">
          {renderScreen()}
        </main>

        {/* Tab bar */}
        <TabBar active={tab} onChange={setTab} />

        {/* Toasts */}
        <ToastContainer toasts={toasts} />

        {/* Debug panel */}
        <DebugPanel />
      </div>
    </AppContext.Provider>
    </ErrorBoundary>
  );
}

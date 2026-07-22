import { X, GripVertical } from 'lucide-react';
import type { Action, DeviceAction, GroupAction, DelayAction, ScenarioAction } from '../../types/scenario-builder';
import type { Device, Scenario, Room } from '../../types';

interface Props {
  action: Action;
  onChange: (a: Action) => void;
  onDelete: () => void;
  devices: Device[];
  rooms: Room[];
  scenarios: Scenario[];
  index: number;
}

const COMMANDS = ['ON', 'OFF', 'OPEN', 'CLOSE'];

export function ActionCard({ action, onChange, onDelete, devices, rooms, scenarios, index }: Props) {
  const commandDevices = devices.filter(d =>
    ['light', 'plug', 'gate', 'lock', 'fan'].includes(d.type)
  );

  const renderDevice = (a: DeviceAction) => (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <select value={a.device}
          onChange={e => onChange({ ...a, device: e.target.value })}
          className="flex-1 bg-bg rounded-btn px-2 py-2 text-xs text-text border border-surface-hover min-h-[36px] appearance-none">
          <option value="">Устройство</option>
          {commandDevices.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select value={a.command}
          onChange={e => onChange({ ...a, command: e.target.value })}
          className="w-20 bg-bg rounded-btn px-2 py-2 text-xs text-text border border-surface-hover min-h-[36px] appearance-none">
          {COMMANDS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {/* Brightness slider for light devices */}
      {commandDevices.find(d => d.id === a.device)?.type === 'light' && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-dim w-8 text-right">
            {a.brightness != null ? `${a.brightness}%` : '100%'}
          </span>
          <input type="range" min={0} max={100} step={5}
            value={a.brightness ?? 100}
            onChange={e => onChange({ ...a, brightness: Number(e.target.value) })}
            className="flex-1 h-6 accent-blue" />
        </div>
      )}
    </div>
  );

  const renderGroup = (a: GroupAction) => (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <select value={a.roomId}
          onChange={e => onChange({ ...a, roomId: e.target.value })}
          className="flex-1 bg-bg rounded-btn px-2 py-2 text-xs text-text border border-surface-hover min-h-[36px] appearance-none">
          <option value="">Комната</option>
          {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select value={a.deviceType}
          onChange={e => onChange({ ...a, deviceType: e.target.value })}
          className="flex-1 bg-bg rounded-btn px-2 py-2 text-xs text-text border border-surface-hover min-h-[36px] appearance-none">
          <option value="light">Свет</option>
          <option value="plug">Розетки</option>
          <option value="gate">Ворота</option>
        </select>
      </div>
      <select value={a.command}
        onChange={e => onChange({ ...a, command: e.target.value })}
        className="bg-bg rounded-btn px-2 py-2 text-xs text-text border border-surface-hover min-h-[36px] appearance-none">
        {COMMANDS.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );

  const renderDelay = (a: DelayAction) => (
    <div className="flex items-center gap-2">
      <input type="number" value={a.seconds}
        onChange={e => onChange({ ...a, seconds: Math.max(1, Number(e.target.value) || 1) })}
        className="w-20 bg-bg rounded-btn px-2 py-2 text-xs text-text border border-surface-hover min-h-[36px] text-center"
        min={1} />
      <span className="text-xs text-text-dim">секунд</span>
      <div className="flex gap-1 ml-auto">
        {[5, 30, 60, 120].map(s => (
          <button key={s} onClick={() => onChange({ ...a, seconds: s })}
            className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors
              ${a.seconds === s ? 'bg-blue/20 border-blue/40 text-blue' : 'bg-surface-hover border-surface-hover text-text-dim hover:text-text'}`}>
            {s >= 60 ? `${s / 60}м` : `${s}с`}
          </button>
        ))}
      </div>
    </div>
  );

  const renderScenario = (a: ScenarioAction) => (
    <div className="flex gap-2">
      <select value={a.scenarioId}
        onChange={e => onChange({ ...a, scenarioId: e.target.value })}
        className="flex-1 bg-bg rounded-btn px-2 py-2 text-xs text-text border border-surface-hover min-h-[36px] appearance-none">
        <option value="">Сценарий</option>
        {scenarios.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <select value={a.enable ? 'on' : 'off'}
        onChange={e => onChange({ ...a, enable: e.target.value === 'on' })}
        className="w-16 bg-bg rounded-btn px-1 py-2 text-xs text-text border border-surface-hover min-h-[36px] text-center appearance-none">
        <option value="on">ВКЛ</option>
        <option value="off">ВЫКЛ</option>
      </select>
    </div>
  );

  const typeLabel = action.type === 'device' ? '⚡ Устройство' :
    action.type === 'group' ? '📦 Группа' :
    action.type === 'delay' ? '⏱ Пауза' : '🔗 Сценарий';

  return (
    <div className="bg-bg rounded-card px-3 py-2.5 border border-surface-hover/50">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-text-dim bg-surface-hover px-1.5 py-0.5 rounded-full shrink-0">
          ДЕЙСТВИЕ {index + 1}
        </span>
        <span className="text-[10px] text-text-dim font-mono">{typeLabel}</span>
        <div className="flex-1" />
        <button onClick={onDelete} className="p-1 text-text-dim hover:text-red"><X size={14} /></button>
      </div>
      {action.type === 'device' && renderDevice(action)}
      {action.type === 'group' && renderGroup(action)}
      {action.type === 'delay' && renderDelay(action)}
      {action.type === 'scenario' && renderScenario(action)}
    </div>
  );
}

import { X } from 'lucide-react';
import type { Condition, DeviceCondition, TimeCondition, StateCondition } from '../../types/scenario-builder';
import { OPS, PROP_OPTIONS, PROP_LABELS, TIME_KINDS } from '../../types/scenario-builder';
import type { Device } from '../../types';

interface Props {
  condition: Condition;
  onChange: (c: Condition) => void;
  onDelete: () => void;
  devices: Device[];       // all sensor devices
  index: number;
}

export function ConditionCard({ condition, onChange, onDelete, devices, index }: Props) {
  const sensorDevices = devices.filter(d => d.type === 'sensor' || d.type === 'climate');

  const renderDevice = (c: DeviceCondition) => (
    <>
      <select value={c.device}
        onChange={e => onChange({ ...c, device: e.target.value })}
        className="flex-1 bg-bg rounded-btn px-2 py-2 text-xs text-text border border-surface-hover min-h-[36px] appearance-none">
        <option value="">Датчик</option>
        {sensorDevices.map(d => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      {c.device && (
        <div className="flex gap-1.5 mt-2">
          <select value={c.property}
            onChange={e => onChange({ ...c, property: e.target.value })}
            className="flex-1 bg-bg rounded-btn px-2 py-2 text-xs text-text border border-surface-hover min-h-[36px] appearance-none">
            {PROP_OPTIONS.map(p => (
              <option key={p} value={p}>{PROP_LABELS[p] || p}</option>
            ))}
          </select>
          <select value={c.operator}
            onChange={e => onChange({ ...c, operator: e.target.value })}
            className="w-14 bg-bg rounded-btn px-1 py-2 text-xs text-text border border-surface-hover min-h-[36px] text-center appearance-none">
            {OPS.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
          <input type="number" value={c.value}
            onChange={e => onChange({ ...c, value: Number(e.target.value) || 0 })}
            className="w-16 bg-bg rounded-btn px-2 py-2 text-xs text-text border border-surface-hover min-h-[36px] text-center"
            placeholder="22" />
        </div>
      )}
    </>
  );

  const renderTime = (c: TimeCondition) => (
    <div className="flex gap-2">
      <select value={c.kind}
        onChange={e => onChange({ ...c, kind: e.target.value as TimeCondition['kind'] })}
        className="flex-1 bg-bg rounded-btn px-2 py-2 text-xs text-text border border-surface-hover min-h-[36px] appearance-none">
        {TIME_KINDS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      {c.kind === 'time' ? (
        <input type="time" value={c.timeStr || '22:00'}
          onChange={e => onChange({ ...c, timeStr: e.target.value })}
          className="flex-1 bg-bg rounded-btn px-2 py-2 text-xs text-text border border-surface-hover min-h-[36px]" />
      ) : c.kind === 'cron' ? (
        <input type="text" value={c.cronExpr || ''}
          onChange={e => onChange({ ...c, cronExpr: e.target.value })}
          placeholder="0 22 * * *"
          className="flex-1 bg-bg rounded-btn px-2 py-2 text-xs text-text border border-surface-hover min-h-[36px]" />
      ) : (
        <input type="number" value={c.offsetMinutes ?? 0}
          onChange={e => onChange({ ...c, offsetMinutes: Number(e.target.value) || 0 })}
          placeholder="±мин"
          className="w-20 bg-bg rounded-btn px-2 py-2 text-xs text-text border border-surface-hover min-h-[36px] text-center" />
      )}
    </div>
  );

  const renderState = (c: StateCondition) => (
    <div className="flex gap-2">
      <select value={c.device}
        onChange={e => onChange({ ...c, device: e.target.value })}
        className="flex-1 bg-bg rounded-btn px-2 py-2 text-xs text-text border border-surface-hover min-h-[36px] appearance-none">
        <option value="">Устройство</option>
        {devices.filter(d => ['gate', 'lock', 'light', 'plug'].includes(d.type)).map(d => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <select value={c.expectedState}
        onChange={e => onChange({ ...c, expectedState: e.target.value })}
        className="flex-1 bg-bg rounded-btn px-2 py-2 text-xs text-text border border-surface-hover min-h-[36px] appearance-none">
        <option value="closed">Закрыто</option>
        <option value="open">Открыто</option>
        <option value="off">Выкл</option>
        <option value="on">Вкл</option>
      </select>
    </div>
  );

  return (
    <div className="bg-bg rounded-card px-3 py-2.5 border border-surface-hover/50">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-text-dim bg-surface-hover px-1.5 py-0.5 rounded-full shrink-0">
          УСЛОВИЕ {index + 1}
        </span>
        <span className="text-[10px] text-text-dim font-mono">
          {condition.type === 'device' ? '📡 Датчик' : condition.type === 'time' ? '🕐 Время' : '📌 Состояние'}
        </span>
        <div className="flex-1" />
        <button onClick={onDelete} className="p-1 text-text-dim hover:text-red"><X size={14} /></button>
      </div>
      {condition.type === 'device' && renderDevice(condition)}
      {condition.type === 'time' && renderTime(condition)}
      {condition.type === 'state' && renderState(condition)}
    </div>
  );
}

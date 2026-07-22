import React, { useState, useEffect } from "react";
import { Loader2, Save, Sparkles, ChevronDown, ChevronUp, X } from "lucide-react";

interface DeviceProfile {
  id: number;
  model: string;
  vendor: string | null;
  exposes_hash: string | null;
  detected_type: string | null;
  friendly_name_template: string | null;
  icon: string | null;
  default_room_hint: string | null;
  default_scenario_json: string | null;
  room_hint: string | null;
  confidence: number | null;
  parameters_json: string | null;
  created_at: string;
  last_seen_at: string | null;
  usage_count: number;
}

/* ———— Room hint presets ———— */
const ROOM_PRESETS = [
  { value: 'any', label: 'Любая' },
  { value: 'living_room', label: 'Гостиная' },
  { value: 'kitchen', label: 'Кухня' },
  { value: 'bedroom', label: 'Спальня' },
  { value: 'bathroom', label: 'Ванная' },
  { value: 'hallway', label: 'Коридор' },
  { value: 'entrance', label: 'Вход' },
  { value: 'balcony', label: 'Балкон' },
  { value: 'storage', label: 'Кладовая' },
  { value: 'garage', label: 'Гараж' },
  { value: 'office', label: 'Кабинет' },
  { value: 'kids_room', label: 'Детская' },
  { value: 'dining_room', label: 'Столовая' },
];

/* ———— Встроенный редактор сценария ———— */
interface ScenarioEditorProps {
  jsonStr: string | null;
  onChange: (json: string | null) => void;
}

function ScenarioEditor({ jsonStr, onChange }: ScenarioEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const parsed = jsonStr ? (() => { try { return JSON.parse(jsonStr); } catch { return null; } })() : null;

  const [triggersJson, setTriggersJson] = useState(
    parsed?.triggers ? JSON.stringify(parsed.triggers, null, 2) : '{\n  "logic": "ANY",\n  "conditions": []\n}'
  );
  const [actionsJson, setActionsJson] = useState(
    parsed?.actions ? JSON.stringify(parsed.actions, null, 2) : '[]'
  );

  const handleSave = () => {
    try {
      const triggers = JSON.parse(triggersJson);
      const actions = JSON.parse(actionsJson);
      onChange(JSON.stringify({ triggers, actions }));
      setExpanded(false);
    } catch (e: any) {
      alert('Ошибка в JSON: ' + e.message);
    }
  };

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 4,
          background: 'transparent', border: '1px solid #D1D5DB',
          fontSize: 11, cursor: 'pointer', color: '#374151',
        }}
      >
        <Sparkles size={12} />
        {expanded ? 'Свернуть' : jsonStr ? 'Редактировать' : 'Создать'}
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {expanded && (
        <div style={{ marginTop: 6 }}>
          <label style={{ fontSize: 10, color: '#6B7280', display: 'block', marginBottom: 2 }}>Триггеры (JSON)</label>
          <textarea
            value={triggersJson}
            onChange={(e) => setTriggersJson(e.target.value)}
            rows={4}
            style={{
              width: '100%', fontSize: 10, fontFamily: 'monospace',
              padding: 4, borderRadius: 4, border: '1px solid #D1D5DB',
              resize: 'vertical', boxSizing: 'border-box',
            }}
          />
          <label style={{ fontSize: 10, color: '#6B7280', display: 'block', margin: '4px 0 2px' }}>Действия (JSON)</label>
          <textarea
            value={actionsJson}
            onChange={(e) => setActionsJson(e.target.value)}
            rows={3}
            style={{
              width: '100%', fontSize: 10, fontFamily: 'monospace',
              padding: 4, borderRadius: 4, border: '1px solid #D1D5DB',
              resize: 'vertical', boxSizing: 'border-box',
            }}
          />
          <button
            onClick={handleSave}
            style={{
              marginTop: 4, padding: '3px 10px', borderRadius: 4,
              background: '#059669', color: '#fff', border: 'none',
              fontSize: 11, fontWeight: 500, cursor: 'pointer',
            }}
          >
            <Save size={11} style={{ marginRight: 4 }} />
            Сохранить сценарий
          </button>
          <button
            onClick={() => { onChange(null); setExpanded(false); }}
            style={{
              marginLeft: 6, padding: '3px 10px', borderRadius: 4,
              background: '#EF4444', color: '#fff', border: 'none',
              fontSize: 11, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Удалить сценарий
          </button>
        </div>
      )}
    </div>
  );
}

/* ———— ProfilerTab ———— */
export default function ProfilerTab() {
  const [profiles, setProfiles] = useState<DeviceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [editRoomHint, setEditRoomHint] = useState<Record<number, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/device-profiles')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setProfiles(data.profiles);
          const hints: Record<number, string> = {};
          data.profiles.forEach((p: DeviceProfile) => { hints[p.id] = p.room_hint || 'any'; });
          setEditRoomHint(hints);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const saveProfile = async (profile: DeviceProfile, updates: Record<string, any>) => {
    setSaving(profile.id);
    try {
      const res = await fetch(`/api/device-profiles/${profile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.ok) {
        setProfiles((prev) =>
          prev.map((p) => (p.id === profile.id ? { ...p, ...updates } : p))
        );
        showToast(`✅ Профиль ${profile.model} обновлён`);
      } else {
        showToast(`❌ Ошибка: ${data.error}`);
      }
    } catch {
      showToast('❌ Ошибка сети');
    } finally {
      setSaving(null);
    }
  };

  const handleScenarioChange = (profile: DeviceProfile, json: string | null) => {
    saveProfile(profile, { default_scenario_json: json });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Loader2 size={24} className="se-spin" />
      </div>
    );
  }

  return (
    <div className="profiler-tab" style={{ padding: '8px 12px 80px' }}>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: '#1F2937', color: '#fff', padding: '8px 16px', borderRadius: 8,
          fontSize: 13, zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          {toast}
        </div>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>Профили устройств</h2>
      <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 12px' }}>
        База знаний для авто-определения устройств. AI сохраняет сюда типы и сценарии.
      </p>

      {profiles.length === 0 ? (
        <p style={{ textAlign: 'center', padding: 40, fontSize: 13, color: '#9CA3AF' }}>
          Пока нет профилей. Они появятся после первого подтверждения устройства.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {profiles.map((p) => (
            <div key={p.id} style={{
              background: '#fff', borderRadius: 8, border: '1px solid #E5E7EB',
              padding: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{p.model}</div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>
                    {p.vendor || '—'} · {p.detected_type || '?'} · {p.usage_count}× использован
                    {p.confidence != null && p.confidence > 0 && (
                      <> · <span style={{ color: '#7C3AED' }}>AI: {(p.confidence * 100).toFixed(0)}%</span></>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => saveProfile(p, {})}
                  disabled={saving === p.id}
                  style={{
                    padding: '4px 8px', borderRadius: 4,
                    background: saving === p.id ? '#E5E7EB' : '#F3F4F6',
                    border: '1px solid #D1D5DB', fontSize: 11, cursor: 'pointer',
                  }}
                >
                  <Save size={12} /> {saving === p.id ? '...' : 'Обновить'}
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
                {/* Room hint */}
                <div>
                  <label style={{ display: 'block', color: '#6B7280', marginBottom: 2 }}>Комната (hint)</label>
                  <select
                    value={editRoomHint[p.id] || 'any'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditRoomHint((prev) => ({ ...prev, [p.id]: val }));
                      saveProfile(p, { room_hint: val });
                    }}
                    style={{
                      width: '100%', padding: '3px 6px', borderRadius: 4,
                      border: '1px solid #D1D5DB', fontSize: 11, background: '#fff',
                    }}
                  >
                    {ROOM_PRESETS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                {/* Default room hint */}
                <div>
                  <label style={{ display: 'block', color: '#6B7280', marginBottom: 2 }}>Default room hint</label>
                  <span style={{ fontSize: 11, color: '#374151', padding: '3px 0', display: 'block' }}>
                    {p.default_room_hint || '—'}
                  </span>
                </div>

                {/* Friendly name template */}
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', color: '#6B7280', marginBottom: 2 }}>Шаблон имени</label>
                  <span style={{ fontSize: 11, color: '#374151' }}>
                    {p.friendly_name_template || '—'}
                  </span>
                </div>

                {/* Scenario */}
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', color: '#6B7280', marginBottom: 2 }}>Сценарий (default_scenario_json)</label>
                  <ScenarioEditor
                    jsonStr={p.default_scenario_json}
                    onChange={(json) => handleScenarioChange(p, json)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

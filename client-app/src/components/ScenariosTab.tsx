import React, { useState } from "react";
import { Trash2, Plus } from "lucide-react";

/* ———————————————————————— ScenariosTab ———————————————————————— */
interface ScenariosTabProps {
  scenarios: any[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (condition: string, action: string) => void;
}

export default function ScenariosTab({ scenarios, onToggle, onDelete, onAdd }: ScenariosTabProps) {
  const [cond, setCond] = useState("");
  const [act, setAct] = useState("");
  return (
    <div className="se-tab-pad">
      <div className="se-tab-title">Сценарии</div>
      <div className="se-tab-caption">IF-THEN правила движка автоматизации</div>

      <div className="se-scn-list">
        {scenarios.map((s: any) => (
          <div key={s.id} className="se-scn-row">
            <button className={"se-switch" + (s.active ? " se-switch--on" : "")} onClick={() => onToggle(s.id)}>
              <span className="se-switch-knob" />
            </button>
            <div className="se-scn-text">
              <span className="se-scn-if">ЕСЛИ</span> {s.condition} <span className="se-scn-then">→</span> {s.action}
            </div>
            <button className="se-icon-btn se-icon-btn--danger" onClick={() => onDelete(s.id)}>
              <Trash2 size={13} strokeWidth={1.8} />
            </button>
          </div>
        ))}
      </div>

      <div className="se-scn-add">
        <input className="se-input" placeholder="Условие: например, температура > 25°C" value={cond} onChange={(e) => setCond(e.target.value)} />
        <input className="se-input" placeholder="Действие: например, включить кондиционер" value={act} onChange={(e) => setAct(e.target.value)} />
        <button
          className="se-primary-btn"
          disabled={!cond.trim() || !act.trim()}
          onClick={() => {
            onAdd(cond.trim(), act.trim());
            setCond("");
            setAct("");
          }}
        >
          <Plus size={14} strokeWidth={2} /> Добавить сценарий
        </button>
      </div>
    </div>
  );
}

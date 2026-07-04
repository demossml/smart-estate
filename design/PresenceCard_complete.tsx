import React, { useState, useEffect, useMemo } from "react";
import {
  User,
  Battery,
  Signal,
  ChevronDown,
  Sun,
  Tv,
  Moon,
  Send,
  Sliders,
  Clock,
  Activity,
} from "lucide-react";

/* ————————————————————————————————————————————————
   ТОКЕНЫ
   Фон:      #0A0C0B (почти чёрный, тёплый подтон)
   Стекло:   rgba(20,26,22,0.55) + blur, кайма rgba(201,162,71,0.14)
   Золото:   #C9A24B  (акцент, статус/бренд)
   Зелень:   #4F8F68  (присутствие / "жизнь")
   Тлеющий:  #7A5C2E  (приглушённый янтарь, вторичные элементы)
   Тревога:  #B23B34  (батарея/таймаут)
   Текст:    #E9E4D8 (основной), #8B9088 (приглушённый)
   Дисплей:  'Cormorant SC' / serif — для чисел и заголовков
   Текст:    Inter — тело
   Данные:   'JetBrains Mono' — метрики (%, мин, ID)
   ———————————————————————————————————————————————— */

const FONT_IMPORT =
  "https://fonts.googleapis.com/css2?family=Cormorant+SC:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";

// —— имитация телеметрии ——
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const ACTIVITY = [
  1, 0, 0, 0, 0, 2, 6, 9, 7, 4, 3, 5, 6, 4, 3, 5, 8, 10, 9, 7, 5, 3, 2, 1,
];
const WEEK = [
  { d: "Пн", hrs: 6.2 },
  { d: "Вт", hrs: 7.1 },
  { d: "Ср", hrs: 5.4 },
  { d: "Чт", hrs: 8.0 },
  { d: "Пт", hrs: 6.8 },
  { d: "Сб", hrs: 11.3 },
  { d: "Вс", hrs: 10.6 },
];

const SCENARIOS = [
  { id: "s1", icon: Sun, label: "Включить свет при входе", active: true },
  { id: "s2", icon: Tv, label: "Выключить ТВ, если никого нет 15 мин", active: true },
  { id: "s3", icon: Moon, label: "Ночник при движении (23:00–07:00)", active: false },
  { id: "s4", icon: Send, label: "Уведомление в Telegram при входе", active: false },
];

function useElapsedLabel(lastSeenMinutesAgo: number, present: boolean): { text: string; danger: boolean } {
  if (present) return { text: "сейчас", danger: false };
  if (lastSeenMinutesAgo < 1) return { text: "только что", danger: false };
  if (lastSeenMinutesAgo < 60)
    return { text: `${lastSeenMinutesAgo} мин назад`, danger: lastSeenMinutesAgo > 30 };
  const h = (lastSeenMinutesAgo / 60).toFixed(1).replace(".0", "");
  return { text: `ушли ${h} ч назад`, danger: true };
}

function batteryColor(pct: number): string {
  if (pct <= 10) return "#B23B34";
  if (pct <= 20) return "#C9A24B";
  return "#7FA98F";
}

export default function PresenceCard() {
  const [expanded, setExpanded] = useState(false);
  const [present, setPresent] = useState(true);
  const [lastSeenAgo, setLastSeenAgo] = useState(0);
  const [battery] = useState(84);
  const [linkquality] = useState(92);
  const [sensitivity, setSensitivity] = useState("Medium");
  const [timeout_, setTimeout_] = useState(180);
  const [keepTime, setKeepTime] = useState(12);
  const [scenarios, setScenarios] = useState(SCENARIOS);

  // тикающий "назад во времени", когда никого нет — просто для реализма демо
  useEffect(() => {
    if (present) return;
    const t = setInterval(() => setLastSeenAgo((v) => v + 1), 15000);
    return () => clearInterval(t);
  }, [present]);

  const elapsed = useElapsedLabel(lastSeenAgo, present);
  const maxActivity = Math.max(...ACTIVITY);
  const todayTriggers = useMemo(() => ACTIVITY.reduce((a, b) => a + b, 0), []);
  const maxWeek = Math.max(...WEEK.map((w) => w.hrs));
  const avgAbsence = "42 мин";
  const peakHour = "18:00–19:00";

  const toggleScenario = (id: string) =>
    setScenarios((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s))
    );

  return (
    <div style={styles.stage}>
      <link rel="stylesheet" href={FONT_IMPORT} />
      <style>{css}</style>

      <div style={styles.card} className="pc-card">
        {/* тонкая рамка-свечение по периметру карточки при присутствии */}
        <div
          className="pc-edge"
          style={{ opacity: present ? 1 : 0 }}
          aria-hidden="true"
        />

        {/* ———— COMPACT ———— */}
        <button
          className="pc-compact"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          <div className="pc-compact-left">
            <div className="pc-icon-wrap">
              <span
                className={"pc-dot" + (present ? " pc-dot--live" : "")}
                style={{
                  background: present ? "#5CC98A" : "#4A4F4B",
                }}
              />
              <User size={20} strokeWidth={1.6} color="#E9E4D8" />
            </div>
            <div className="pc-compact-text">
              <div className="pc-room">Прихожая</div>
              <div className="pc-status-row">
                <span
                  className="pc-status"
                  style={{ color: present ? "#7FE0A8" : "#9AA098" }}
                >
                  {present ? "Есть" : "Нет"}
                </span>
                <span className="pc-sep">·</span>
                <span
                  className="pc-elapsed"
                  style={{ color: elapsed.danger ? "#D9695F" : "#8B9088" }}
                >
                  {elapsed.text}
                </span>
              </div>
            </div>
          </div>

          <div className="pc-compact-right">
            <div className="pc-metric" title="Заряд батареи">
              <Battery size={14} strokeWidth={1.6} color={batteryColor(battery)} />
              <span style={{ color: batteryColor(battery) }}>{battery}%</span>
            </div>
            <div className="pc-metric" title="Уровень сигнала Zigbee">
              <Signal size={14} strokeWidth={1.6} color="#8B9088" />
              <span>{linkquality}</span>
            </div>
            <ChevronDown
              size={18}
              strokeWidth={1.6}
              color="#C9A24B"
              style={{
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 320ms cubic-bezier(.4,0,.2,1)",
              }}
            />
          </div>
        </button>

        {/* демо-переключатель присутствия, чтобы карточку можно было "пощупать" */}
        <button
          className="pc-demo-toggle"
          onClick={() => {
            setPresent((p) => !p);
            setLastSeenAgo(0);
          }}
        >
          demo: {present ? "имитировать уход" : "имитировать приход"}
        </button>

        {/* ———— EXPANDED ———— */}
        <div className={"pc-expand" + (expanded ? " pc-expand--open" : "")}>
          <div className="pc-expand-inner">
            {/* 1. Блок статуса */}
            <section className="pc-section">
              <div className="pc-section-head">
                <Clock size={13} strokeWidth={1.8} color="#C9A24B" />
                <span>Статус</span>
              </div>

              <div className="pc-status-grid">
                <div className="pc-status-cell">
                  <div className="pc-label">Обнаружено</div>
                  <div className="pc-value pc-value--now">
                    {present ? "Сейчас" : "—"}
                  </div>
                </div>
                <div className="pc-status-cell">
                  <div className="pc-label">Последний раз</div>
                  <div className="pc-value">сегодня в 14:32</div>
                </div>
                <div className="pc-status-cell">
                  <div className="pc-label">Срабатываний сегодня</div>
                  <div className="pc-value pc-value--num">{todayTriggers}</div>
                </div>
              </div>

              <div className="pc-hist">
                {HOURS.map((h) => (
                  <div className="pc-hist-col" key={h}>
                    <div
                      className="pc-hist-bar"
                      style={{
                        height: `${Math.max(4, (ACTIVITY[h] / maxActivity) * 100)}%`,
                        background:
                          ACTIVITY[h] === 0
                            ? "rgba(139,144,136,0.18)"
                            : "linear-gradient(180deg,#7FE0A8, #3E7A56)",
                      }}
                    />
                    {h % 4 === 0 && <span className="pc-hist-label">{h}</span>}
                  </div>
                ))}
              </div>
              <div className="pc-hist-caption">Активность по часам, последние 24 ч</div>
            </section>

            {/* 2. Настройки датчика */}
            <section className="pc-section">
              <div className="pc-section-head">
                <Sliders size={13} strokeWidth={1.8} color="#C9A24B" />
                <span>Настройки датчика</span>
              </div>

              <div className="pc-field">
                <div className="pc-field-row">
                  <span className="pc-label">Чувствительность</span>
                </div>
                <div className="pc-segmented">
                  {["Low", "Medium", "High"].map((opt) => (
                    <button
                      key={opt}
                      className={
                        "pc-seg-btn" +
                        (sensitivity === opt ? " pc-seg-btn--active" : "")
                      }
                      onClick={() => setSensitivity(opt)}
                    >
                      {opt === "Low" ? "Низкая" : opt === "Medium" ? "Средняя" : "Высокая"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pc-field">
                <div className="pc-field-row">
                  <span className="pc-label">Тайм-аут присутствия</span>
                  <span className="pc-mono-val">{timeout_} сек</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={600}
                  value={timeout_}
                  onChange={(e) => setTimeout_(Number(e.target.value))}
                  className="pc-slider"
                />
              </div>

              <div className="pc-field">
                <div className="pc-field-row">
                  <span className="pc-label">Keep time</span>
                  <span className="pc-mono-val">{keepTime} сек</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  value={keepTime}
                  onChange={(e) => setKeepTime(Number(e.target.value))}
                  className="pc-slider"
                />
              </div>
            </section>

            {/* 3. Сценарии */}
            <section className="pc-section">
              <div className="pc-section-head">
                <span className="pc-section-glyph">✦</span>
                <span>Сценарии</span>
              </div>
              <div className="pc-scenario-list">
                {scenarios.map((s) => (
                  <button
                    key={s.id}
                    className={
                      "pc-scenario" + (s.active ? " pc-scenario--active" : "")
                    }
                    onClick={() => toggleScenario(s.id)}
                  >
                    <s.icon size={15} strokeWidth={1.6} />
                    <span>{s.label}</span>
                    <span className="pc-scenario-switch">
                      <span className="pc-scenario-knob" />
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* 4. Статистика за 7 дней */}
            <section className="pc-section pc-section--last">
              <div className="pc-section-head">
                <Activity size={13} strokeWidth={1.8} color="#C9A24B" />
                <span>Статистика · 7 дней</span>
              </div>

              <div className="pc-week">
                {WEEK.map((w) => (
                  <div className="pc-week-col" key={w.d}>
                    <div className="pc-week-track">
                      <div
                        className="pc-week-fill"
                        style={{ height: `${(w.hrs / maxWeek) * 100}%` }}
                      />
                    </div>
                    <span className="pc-week-label">{w.d}</span>
                  </div>
                ))}
              </div>

              <div className="pc-stat-row">
                <div>
                  <div className="pc-label">Среднее отсутствие</div>
                  <div className="pc-value pc-value--num">{avgAbsence}</div>
                </div>
                <div>
                  <div className="pc-label">Пик активности</div>
                  <div className="pc-value pc-value--num">{peakHour}</div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  stage: {
    minHeight: "100vh",
    width: "100%",
    background: "#0A0C0B",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "48px 20px",
    fontFamily: "'Inter', sans-serif",
  },
  card: {
    position: "relative",
    width: 380,
    maxWidth: "100%",
  },
};

const css = `
  .pc-card {
    border-radius: 20px;
    background: linear-gradient(165deg, rgba(24,30,25,0.72), rgba(14,18,15,0.72));
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border: 1px solid rgba(201,162,75,0.16);
    box-shadow: 0 24px 60px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.03);
    overflow: hidden;
  }

  .pc-edge {
    position: absolute;
    inset: 0;
    border-radius: 20px;
    pointer-events: none;
    box-shadow: 0 0 0 1px rgba(95,201,138,0.35), 0 0 24px rgba(95,201,138,0.10);
    transition: opacity 600ms ease;
    z-index: 0;
  }

  .pc-compact {
    position: relative;
    z-index: 1;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 18px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
  }

  .pc-compact-left { display: flex; align-items: center; gap: 14px; }

  .pc-icon-wrap {
    position: relative;
    width: 42px; height: 42px;
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(201,162,75,0.14);
  }

  .pc-dot {
    position: absolute;
    top: -3px; right: -3px;
    width: 9px; height: 9px;
    border-radius: 50%;
    box-shadow: 0 0 0 3px rgba(10,12,11,0.9);
  }
  .pc-dot--live { animation: pc-pulse 2.2s ease-out infinite; }

  @keyframes pc-pulse {
    0%   { box-shadow: 0 0 0 3px rgba(10,12,11,0.9), 0 0 0 0 rgba(92,201,138,0.55); }
    70%  { box-shadow: 0 0 0 3px rgba(10,12,11,0.9), 0 0 0 9px rgba(92,201,138,0); }
    100% { box-shadow: 0 0 0 3px rgba(10,12,11,0.9), 0 0 0 0 rgba(92,201,138,0); }
  }

  .pc-room {
    font-family: 'Cormorant SC', serif;
    font-size: 19px;
    letter-spacing: 0.02em;
    color: #E9E4D8;
    font-weight: 600;
    line-height: 1.1;
  }

  .pc-status-row { display: flex; align-items: baseline; gap: 6px; margin-top: 4px; }
  .pc-status { font-size: 13px; font-weight: 500; }
  .pc-sep { color: #4A4F4B; font-size: 12px; }
  .pc-elapsed { font-size: 12.5px; font-family: 'JetBrains Mono', monospace; }

  .pc-compact-right { display: flex; align-items: center; gap: 14px; }
  .pc-metric {
    display: flex; align-items: center; gap: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px; color: #8B9088;
  }

  .pc-demo-toggle {
    position: relative; z-index: 1;
    display: block;
    margin: 0 18px 14px;
    font-size: 10.5px;
    letter-spacing: 0.04em;
    font-family: 'JetBrains Mono', monospace;
    color: #7A5C2E;
    background: rgba(201,162,75,0.06);
    border: 1px solid rgba(201,162,75,0.16);
    border-radius: 8px;
    padding: 5px 10px;
    cursor: pointer;
  }
  .pc-demo-toggle:hover { color: #C9A24B; border-color: rgba(201,162,75,0.35); }

  .pc-expand {
    max-height: 0;
    overflow: hidden;
    transition: max-height 420ms cubic-bezier(.4,0,.2,1);
  }
  .pc-expand--open { max-height: 1400px; }

  .pc-expand-inner {
    padding: 4px 18px 22px;
    border-top: 1px solid rgba(201,162,75,0.10);
  }

  .pc-section { padding: 18px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .pc-section--last { border-bottom: none; padding-bottom: 4px; }

  .pc-section-head {
    display: flex; align-items: center; gap: 7px;
    font-family: 'Cormorant SC', serif;
    font-size: 13px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #C9A24B;
    margin-bottom: 14px;
  }
  .pc-section-glyph { font-size: 11px; }

  .pc-label {
    font-size: 10.5px;
    letter-spacing: 0.03em;
    color: #7A7F79;
    text-transform: uppercase;
  }
  .pc-value { font-size: 13px; color: #D8D3C6; margin-top: 3px; font-weight: 500; }
  .pc-value--now { color: #7FE0A8; font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 15px; }
  .pc-value--num { font-family: 'JetBrains Mono', monospace; color: #E9E4D8; }

  .pc-status-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 16px;
  }

  .pc-hist { display: flex; align-items: flex-end; height: 56px; gap: 3px; }
  .pc-hist-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; position: relative; }
  .pc-hist-bar { width: 100%; border-radius: 2px 2px 0 0; min-height: 3px; }
  .pc-hist-label { position: absolute; bottom: -16px; font-size: 8.5px; color: #5A5F58; font-family: 'JetBrains Mono', monospace; }
  .pc-hist-caption { margin-top: 20px; font-size: 10px; color: #5A5F58; text-align: right; }

  .pc-field { margin-bottom: 16px; }
  .pc-field:last-child { margin-bottom: 0; }
  .pc-field-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .pc-mono-val { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #C9A24B; }

  .pc-segmented {
    display: flex;
    background: rgba(0,0,0,0.25);
    border-radius: 9px;
    padding: 3px;
    border: 1px solid rgba(255,255,255,0.05);
  }
  .pc-seg-btn {
    flex: 1;
    padding: 7px 0;
    font-size: 11.5px;
    font-family: inherit;
    color: #8B9088;
    background: transparent;
    border: none;
    border-radius: 7px;
    cursor: pointer;
    transition: all 200ms ease;
  }
  .pc-seg-btn--active {
    background: linear-gradient(165deg, rgba(95,201,138,0.20), rgba(95,201,138,0.06));
    color: #B8F0CE;
    box-shadow: inset 0 0 0 1px rgba(95,201,138,0.30);
  }

  .pc-slider {
    -webkit-appearance: none;
    width: 100%;
    height: 3px;
    border-radius: 2px;
    background: linear-gradient(90deg, #4F8F68, rgba(255,255,255,0.08));
    outline: none;
  }
  .pc-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px; height: 14px;
    border-radius: 50%;
    background: #C9A24B;
    border: 2px solid #0A0C0B;
    cursor: pointer;
    box-shadow: 0 0 0 3px rgba(201,162,75,0.15);
  }
  .pc-slider::-moz-range-thumb {
    width: 14px; height: 14px;
    border-radius: 50%;
    background: #C9A24B;
    border: 2px solid #0A0C0B;
    cursor: pointer;
  }

  .pc-scenario-list { display: flex; flex-direction: column; gap: 6px; }
  .pc-scenario {
    display: flex; align-items: center; gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.05);
    color: #9AA098;
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    transition: all 200ms ease;
  }
  .pc-scenario span:nth-child(2) { flex: 1; }
  .pc-scenario--active {
    color: #D8D3C6;
    border-color: rgba(201,162,75,0.20);
    background: rgba(201,162,75,0.04);
  }
  .pc-scenario-switch {
    width: 30px; height: 17px;
    border-radius: 20px;
    background: rgba(255,255,255,0.08);
    position: relative;
    flex-shrink: 0;
    transition: background 200ms ease;
  }
  .pc-scenario--active .pc-scenario-switch { background: #3E7A56; }
  .pc-scenario-knob {
    position: absolute;
    top: 2px; left: 2px;
    width: 13px; height: 13px;
    border-radius: 50%;
    background: #E9E4D8;
    transition: transform 200ms ease;
  }
  .pc-scenario--active .pc-scenario-knob { transform: translateX(13px); }

  .pc-week { display: flex; align-items: flex-end; gap: 8px; height: 70px; margin-bottom: 16px; }
  .pc-week-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
  .pc-week-track {
    flex: 1; width: 100%; display: flex; align-items: flex-end;
    background: rgba(255,255,255,0.03);
    border-radius: 3px;
    overflow: hidden;
  }
  .pc-week-fill {
    width: 100%;
    background: linear-gradient(180deg, #C9A24B, #7A5C2E);
    border-radius: 3px 3px 0 0;
  }
  .pc-week-label { margin-top: 6px; font-size: 10px; color: #5A5F58; font-family: 'JetBrains Mono', monospace; }

  .pc-stat-row { display: flex; justify-content: space-between; }
`;

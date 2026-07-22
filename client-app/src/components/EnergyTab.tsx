import React, { useState, useEffect } from "react";
import { Plug as PlugIcon } from "lucide-react";
import { api } from "../api/client";

// НАХОДКА (Модуль 8): захардкоженный ENERGY_TREND — уже ТРЕТЬЕ независимое
// место в приложении с фейковым графиком энергопотребления (после
// Dashboard.tsx FALLBACK_TREND — уже исправлен на реальные данные — и
// Analytics.tsx ENERGY_DATA — помечен, ждёт решения по агрегации). Здесь
// используем уже существующий api.getEnergyTrend() (добавлен в Модуле 8
// ради Dashboard.tsx) вместо третьей копии фейковых чисел. Оставляем как
// fallback на случай недоступности API — тот же принцип, что в Dashboard.tsx.
const FALLBACK_TREND = [3.1, 2.8, 2.6, 2.4, 2.9, 3.6, 4.8, 5.2, 4.1, 3.7, 3.9, 4.4, 4.9, 5.5, 6.1, 6.8, 7.2, 6.4, 5.3, 4.6, 4.0, 3.6, 3.3, 3.0];

/* ———————————————————————— EnergyTab ———————————————————————— */
interface EnergyTabProps {
  devices: any[];
}

export default function EnergyTab({ devices }: EnergyTabProps) {
  const [trend, setTrend] = useState<{ hour: string; power: number }[]>([]);

  useEffect(() => {
    api.getEnergyTrend().then(r => { if (r.ok) setTrend(r.trend); }).catch(() => {});
  }, []);

  const plugs = devices.filter((d: any) => d.type === "plug");
  // НАХОДКА: ratedPower не существует нигде в системе (ни в типе Device, ни
  // в маппинге api/client.ts) — реальное поле называется power. Раньше
  // totalNow становился NaN, как только хотя бы одна розетка включена
  // (0 + undefined = NaN). Тот же баг, что был в HomeWidgets.tsx.
  const totalNow = plugs.reduce((sum: number, p: any) => sum + (p.state ? (p.power || 0) : 0), 0);

  const chartData = trend.length > 0 ? trend.map(t => t.power) : FALLBACK_TREND;
  const maxTrend = Math.max(...chartData, 0.001);

  return (
    <div className="se-tab-pad">
      <div className="se-tab-title">Энергопотребление</div>
      <div className="se-tab-caption">Розетки и общий расход дома</div>

      <div className="se-energy-hero">
        <div className="se-energy-hero-num">{(totalNow / 1000).toFixed(2)}</div>
        <div className="se-energy-hero-unit">кВт сейчас</div>
      </div>

      <div className="se-hist se-hist--energy">
        {chartData.map((v, i) => (
          <div className="pc-hist-col" key={i}>
            <div className="pc-hist-bar" style={{ height: `${(v / maxTrend) * 100}%`, background: "linear-gradient(180deg,#C9A24B,#7A5C2E)" }} />
          </div>
        ))}
      </div>
      <div className="pc-hist-caption">кВт·ч, последние 24 ч{trend.length === 0 ? " (нет данных — показан пример)" : ""}</div>

      <div className="se-plug-list">
        {plugs.map((p: any) => (
          <div className="se-plug-row" key={p.id}>
            <PlugIcon size={15} strokeWidth={1.6} color={p.state ? "#7FE0A8" : "#5A5F58"} />
            <span className="se-plug-name">{p.name}</span>
            <span className="se-mono">{p.state ? (p.power || 0) : 0} Вт</span>
          </div>
        ))}
      </div>
    </div>
  );
}

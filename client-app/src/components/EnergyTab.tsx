import React from "react";
import { Plug as PlugIcon } from "lucide-react";

const ENERGY_TREND = [3.1, 2.8, 2.6, 2.4, 2.9, 3.6, 4.8, 5.2, 4.1, 3.7, 3.9, 4.4, 4.9, 5.5, 6.1, 6.8, 7.2, 6.4, 5.3, 4.6, 4.0, 3.6, 3.3, 3.0];

/* ———————————————————————— EnergyTab ———————————————————————— */
interface EnergyTabProps {
  devices: any[];
}

export default function EnergyTab({ devices }: EnergyTabProps) {
  const plugs = devices.filter((d: any) => d.type === "plug");
  const totalNow = plugs.reduce((sum: number, p: any) => sum + (p.state ? p.ratedPower : 0), 0);
  const maxTrend = Math.max(...ENERGY_TREND);

  return (
    <div className="se-tab-pad">
      <div className="se-tab-title">Энергопотребление</div>
      <div className="se-tab-caption">Розетки и общий расход дома</div>

      <div className="se-energy-hero">
        <div className="se-energy-hero-num">{(totalNow / 1000).toFixed(2)}</div>
        <div className="se-energy-hero-unit">кВт сейчас</div>
      </div>

      <div className="se-hist se-hist--energy">
        {ENERGY_TREND.map((v, i) => (
          <div className="pc-hist-col" key={i}>
            <div className="pc-hist-bar" style={{ height: `${(v / maxTrend) * 100}%`, background: "linear-gradient(180deg,#C9A24B,#7A5C2E)" }} />
          </div>
        ))}
      </div>
      <div className="pc-hist-caption">кВт·ч, последние 24 ч</div>

      <div className="se-plug-list">
        {plugs.map((p: any) => (
          <div className="se-plug-row" key={p.id}>
            <PlugIcon size={15} strokeWidth={1.6} color={p.state ? "#7FE0A8" : "#5A5F58"} />
            <span className="se-plug-name">{p.name}</span>
            <span className="se-mono">{p.state ? p.ratedPower : 0} Вт</span>
          </div>
        ))}
      </div>
    </div>
  );
}

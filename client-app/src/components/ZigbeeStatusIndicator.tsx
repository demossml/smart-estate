import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useZigbeeStatus } from '../hooks/useZigbeeStatus';

export default function ZigbeeStatusIndicator() {
  const { status, loading } = useZigbeeStatus();
  const [open, setOpen] = useState(false);

  const isConnected = status.mqtt_connected;
  const isJoining = status.permit_join;

  if (loading) return null;

  return (
    <div className="se-zigbee-wrapper" style={{ position: 'relative' }}>
      <button
        className="se-zigbee-indicator"
        onClick={() => setOpen(!open)}
        title={isConnected ? 'Zigbee работает' : 'Zigbee отключён'}
      >
        <span
          className={`se-zigbee-dot ${isConnected ? 'se-zigbee-dot--on' : 'se-zigbee-dot--off'}`}
        />
        {isJoining && <span className="se-zigbee-pulse" />}
        <span className="se-zigbee-count">{status.devices_total}</span>
      </button>

      {open && (
        <div className="se-zigbee-popover">
          <div className="se-zigbee-popover-head">
            <span>Zigbee сеть</span>
            <button className="se-icon-btn" onClick={() => setOpen(false)}>
              <X size={13} strokeWidth={1.8} />
            </button>
          </div>

          <div className="se-zigbee-popover-row">
            <span>Донгл / MQTT</span>
            <span className={isConnected ? 'se-zigbee-popover-val se-zigbee-popover-val--ok' : 'se-zigbee-popover-val se-zigbee-popover-val--bad'}>
              {isConnected ? 'Подключён' : 'Нет соединения'}
            </span>
          </div>

          <div className="se-zigbee-popover-row">
            <span>Режим поиска</span>
            <span>{isJoining ? `Открыт (${status.permit_join_time_left}с)` : 'Закрыт'}</span>
          </div>

          <div className="se-zigbee-popover-row">
            <span>Устройств в сети</span>
            <span>{status.devices_total} ({status.devices_online} онлайн)</span>
          </div>
        </div>
      )}
    </div>
  );
}

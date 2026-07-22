import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import type { ZigbeeStatus } from '../api/client';

const DEFAULT: ZigbeeStatus = {
  ok: false,
  mqtt_connected: false,
  permit_join: false,
  permit_join_time_left: 0,
  devices_total: 0,
  devices_online: 0,
};

export function useZigbeeStatus() {
  const [status, setStatus] = useState<ZigbeeStatus>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await api.getZigbeeStatus();
        setStatus(data);
      } catch {
        setStatus(DEFAULT);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 5000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { status, loading };
}

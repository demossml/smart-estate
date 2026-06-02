import { useEffect, useRef, useState } from 'react';
import { logClient } from '../lib/logger';

export function useEstateSocket() {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState('—');
  const retriesRef = useRef(0);
  const timerRef = useRef(0);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let stopped = false;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

      socket.addEventListener('open', () => {
        retriesRef.current = 0;
        setConnected(true);
        setLastMessage('подключено');
      });

      socket.addEventListener('message', event => {
        setLastMessage(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        if (typeof event.data === 'string' && event.data.includes('error')) {
          logClient('warn', 'WS событие с ошибкой', event.data);
        }
      });

      socket.addEventListener('close', () => {
        setConnected(false);
        setLastMessage('нет связи');
        if (!stopped) scheduleReconnect();
      });

      socket.addEventListener('error', () => {
        logClient('warn', 'WebSocket недоступен');
        socket?.close();
      });
    };

    const scheduleReconnect = () => {
      const delay = Math.min(1000 * 2 ** retriesRef.current, 30000);
      retriesRef.current++;
      timerRef.current = window.setTimeout(() => {
        if (!stopped) connect();
      }, delay);
    };

    connect();

    return () => {
      stopped = true;
      window.clearTimeout(timerRef.current);
      socket?.close();
    };
  }, []);

  return { connected, lastMessage };
}

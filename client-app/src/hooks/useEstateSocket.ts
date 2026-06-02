import { useEffect, useState } from 'react';
import { logClient } from '../lib/logger';

export function useEstateSocket() {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<string>('—');

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

    socket.addEventListener('open', () => {
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
    });

    socket.addEventListener('error', () => {
      logClient('warn', 'WebSocket недоступен');
    });

    return () => socket.close();
  }, []);

  return { connected, lastMessage };
}

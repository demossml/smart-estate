import { useEffect, useRef, useState, useCallback } from 'react';
import { logClient } from '../lib/logger';
import { getApiKey } from '../api/client';

type SocketCallback = (topic: string, payload: Record<string, any>) => void;

export function useEstateSocket(onTelemetry?: SocketCallback) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState('—');
  const retriesRef = useRef(0);
  const timerRef = useRef(0);
  const cbRef = useRef(onTelemetry);
  cbRef.current = onTelemetry;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let stopped = false;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      // НАХОДКА (Модуль 8): нативный WebSocket API браузера не умеет
      // отправлять кастомные заголовки (X-API-Key просто некуда положить) —
      // бэкенд (attachWebSocket в mqtt-ws.ts) как раз поэтому поддерживает
      // fallback через query-параметр ?api_key=..., но этот хук им не
      // пользовался. После того как API_KEYS стал обязательным (Модуль 1),
      // каждое подключение получало бы 401 и уходило в бесконечный реконнект
      // с экспоненциальной задержкой — живая телеметрия не работала бы
      // вообще, при этом внешне выглядело бы как "то подключается, то нет".
      const key = getApiKey();
      const qs = key ? `?api_key=${encodeURIComponent(key)}` : '';
      socket = new WebSocket(`${protocol}://${window.location.host}/ws${qs}`);

      socket.addEventListener('open', () => {
        retriesRef.current = 0;
        setConnected(true);
        setLastMessage('подключено');
      });

      socket.addEventListener('message', event => {
        setLastMessage(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'mqtt' && msg.payload && cbRef.current) {
            // Форвард телеметрии в колбэк
            cbRef.current(msg.topic, msg.payload);
          }
        } catch {}
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

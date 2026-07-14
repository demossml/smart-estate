# Zigbee Dongle Status Indicator — Implementation Plan

> **Goal:** Добавить в веб-приложение «Умная Усадьба» визуальный индикатор, который показывает пользователю: воткнут ли Dongle, работает ли Zigbee2MQTT, есть ли устройства в сети, активен ли permit join.

**Почему это нужно:** Сейчас пользователь не видит в интерфейсе, работает ли Zigbee-сеть вообще. Он жмёт «Начать поиск устройств», жмёт на датчике кнопку — и не понимает, происходит ли что-то. Индикатор решит эту проблему.

**Где будет отображаться:** В шапке приложения (рядом с кнопкой Live/Demo) — чтобы видно с любой страницы.

---

## Task 1: Backend — новый эндпоинт GET /api/zigbee/status

**Файлы:** `server/src/mqtt-ws.ts`, `server/src/api.ts`

**В mqtt-ws.ts — экспортировать статусы:**
- `mqttConnected` — при `client.on('connect')` и `client.on('close')`
- `permitJoinActive` / `permitJoinTimeLeft` — слушать `zigbee2mqtt/bridge/response/permit_join`

**В api.ts — новый роут:**
```typescript
import { mqttConnected, permitJoinActive, permitJoinTimeLeft } from './mqtt-ws';

app.get('/api/zigbee/status', async (_req, res) => {
  try {
    const devices = await query('SELECT COUNT(*) as cnt FROM devices');
    const online = await query("SELECT COUNT(*) as cnt FROM devices WHERE status = 'online'");
    res.json({
      ok: true,
      mqtt_connected: mqttConnected,
      permit_join: permitJoinActive,
      permit_join_time_left: permitJoinTimeLeft,
      devices_total: devices[0]?.cnt || 0,
      devices_online: online[0]?.cnt || 0,
    });
  } catch (e: any) {
    logErrorWithLog(null, 'api_error', e.message, 'zigbee_status');
    res.status(500).json({ ok: false, error: e.message });
  }
});
```

---

## Task 2: Frontend — API-метод + хук + компонент

**Файлы:** `client-app/src/api/client.ts`, `client-app/src/hooks/useZigbeeStatus.ts`, `client-app/src/components/ZigbeeStatusIndicator.tsx`, `client-app/src/App.tsx`, `client-app/src/index.css`

**api/client.ts:**
```typescript
export interface ZigbeeStatus {
  ok: boolean; mqtt_connected: boolean; permit_join: boolean;
  permit_join_time_left: number; devices_total: number; devices_online: number;
}
export async function getZigbeeStatus(): Promise<ZigbeeStatus> {
  const res = await fetch(`${BASE}/zigbee/status`, { headers: { 'X-API-Key': getApiKey() } });
  return res.json();
}
```

**hooks/useZigbeeStatus.ts** — polling 5с, возвращает `{ status, loading }`.

**components/ZigbeeStatusIndicator.tsx:**
- Кнопка с точкой (🟢/🔴), числом устройств
- При активном permit_join — жёлтая пульсация
- По клику — popover с деталями (MQTT, режим поиска, устройства)

**App.tsx** — добавить `<ZigbeeStatusIndicator />` в шапку рядом с mode pill.

**index.css** — стили для `.se-zigbee-indicator`, `.se-zigbee-dot`, `.se-zigbee-pulse`, `.se-zigbee-popover`, `@keyframes se-pulse`.

---

## Визуальная схема

```
Шапка: [🟢 3] [Live/Demo]
         ↑ зелёная — MQTT ОК
         число — устройств в сети
         если поиск активен — жёлтая пульсация

При клике:
┌──────────────────┐
│ Zigbee сеть  [✕] │
│ Донгл/MQTT:  🟢  │
│ Поиск: Открыт 180с│
│ Устройств: 3 (2)  │
└──────────────────┘
```

---

**Итого:** ~5 файлов, ~150 строк нового кода. Всё простое, без новых зависимостей.

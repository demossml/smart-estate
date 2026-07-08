# DEBUG: Device Discovery (Smart-Estate)

## Архитектура поиска устройств

```
┌─────────────────┐     Модуль пары (кнопка)     ┌──────────────────┐
│   Новый датчик  │ ──────────────────────────→  │  Zigbee2MQTT     │
│  (режим паринга)│                               │  (docker)        │
└─────────────────┘                               └────────┬─────────┘
                                                           │
                                              MQTT publish: bridge/event
                                              (device_joined, device_announce,
                                               device_interview)
                                                           │
                                                           ▼
                                              ┌──────────────────────┐
                                              │  mqtt-ws.ts          │
                                              │  onMessage()         │
                                              │  ├─ handleDeviceDiscovery()
                                              │  └─ handleBridgeEvent()
                                              │                     │
                                              │  1. stmt.upsertDevice()
                                              │  2. stmt.insertDiscoveryEvent()
                                              │  3. WS broadcast → wss.clients
                                              │  4. console.log('[DISCOVERY]')
                                              └────────┬─────────────┘
                                                       │
                          ┌────────────────────────────┤
                          ▼                            ▼
              ┌─────────────────────┐      ┌──────────────────────┐
              │ SQLite (via better- │      │ WebSocket (wss)      │
              │ sqlite3)            │      │ type:'discovery'     │
              │ devices             │      │ data:{device_data}   │
              │ discovery_events    │      └──────────────────────┘
              └────────┬────────────┘      └──────────────────────┘
                       │
                       ▼
              ┌─────────────────────┐
              │ SSE /api/discovery/ │
              │ events (poll 2s)    │
              │ stmt.getDiscoveryEv.│
              └────────┬────────────┘
                       │
                       ▼
              ┌─────────────────────┐
              │ Клиент (React SPA)  │
              │ App.tsx:            │
              │ 1. /discovery/start │ → permit_join
              │ 2. SSE /discovery/  │   events (live)
              │ 3. /devices/pending │   (poll 5s)
              └─────────────────────┘
```

## Как работает фронтенд (App.tsx)

1. Пользователь жмёт «Начать поиск устройств» → `startDiscovery()`
2. `POST /api/discovery/start` → MQTT `permit_join: {value: true, time: 254}`
3. Открывается SSE на `/api/discovery/events`
4. Запускается интервал poll `/api/devices/pending` каждые 5 сек
5. Когда zigbee2mqtt находит новое устройство:
   - MQTT: `device_joined` → `handleBridgeEvent()` → пишет в devices + discovery_events
   - MQTT: `device_announce` → `handleDeviceDiscovery()` → то же самое
   - MQTT: `device_interview` → `handleBridgeEvent()` → обновляет модель/вендора
6. SSE видит новую запись в discovery_events → отправляет на клиент
7. Клиент показывает устройство в списке «Найденные устройства»
8. Пользователь жмёт «Добавить» → `POST /api/discovery/:ieee/confirm` → upsert в devices

## Консоль-логи ([DISCOVERY])

Добавлены во все ключевые точки:

### api.ts

| Эндпоинт | Лог |
|----------|-----|
| `POST /discovery/start` | `[DISCOVERY] /api/discovery/start — opening zigbee network` |
| | `[DISCOVERY] MQTT connected — sending permit_join=true time=254` |
| | `[DISCOVERY] permit_join sent successfully` |
| `POST /discovery/stop` | `[DISCOVERY] /api/discovery/stop — closing zigbee network` |
| `GET /discovery/events` | `[DISCOVERY] /api/discovery/events — new SSE connection` |
| | `[DISCOVERY] SSE: sending N existing events` |
| | `[DISCOVERY] SSE: new event id=N ieee=0x...` |
| `GET /devices/pending` | `[DISCOVERY] /api/devices/pending called` |
| | `[DISCOVERY] Z2M DB lines: N` |
| | `[DISCOVERY] Z2M device types: [type1, type2]` |
| | `[DISCOVERY] Z2M first device: {ieee, name, type}` |
| | `[DISCOVERY] Z2M realDevices: N` |
| | `[DISCOVERY] Known devices in DB: N [0x..., 0x...]` |
| | `[DISCOVERY] Pending (Z2M - known): N` |
| | `[DISCOVERY] All Z2M devices are already in DB` |

### mqtt-ws.ts

| Место | Лог |
|-------|-----|
| `handleDeviceDiscovery()` | `[DISCOVERY] handleDeviceDiscovery: type=TYP ieee=0x... name=... model=...` |
| | `[DISCOVERY] Device 0x... already in DB as "name"` |
| | `[DISCOVERY] New device 0x... — inserting into DB` |
| | `[DISCOVERY] Discovery event logged for 0x...` |
| | `[DISCOVERY] Broadcasting via WS to N clients: {...}` |
| | `[DISCOVERY] No WS clients to broadcast to` |

## Известные проблемы

### 1. Дублирующийся /api/devices/pending (ИСПРАВЛЕНО)
Было два эндпоинта: строка 202 (активный) и 590 (мёртвый). Удалён дубликат на 590.

### 2. SSE vs WebSocket — два канала
MQTT пишет и в discovery_events (для SSE) и в WebSocket broadcast. Клиент подписан ТОЛЬКО на SSE. WS broadcast не используется фронтендом.

### 3. SQLite single-writer (better-sqlite3)
MQTT пишет через `stmt.insertDiscoveryEvent` (prepared statements). SSE поллит `db.prepare('SELECT...').all()` — это один и тот же экземпляр better-sqlite3, без race condition. ✅

### 4. Датчик уже сопряжён — не появится как новый
Если датчик уже есть в zigbee2mqtt (даже не в нашей БД), `permit_join` не создаст новый `device_joined` — только `device_announce`. А `handleDeviceDiscovery` пишет в `stmt.upsertDevice` с `ON CONFLICT` — существующий датчик не дублируется, но discovery_event пишется.

### 5. handleBridgeEvent vs handleDeviceDiscovery — дубли
`device_announce` приходит и через `zigbee2mqtt/TOPIC_NAME` (handleDeviceDiscovery), и через `zigbee2mqtt/bridge/event` (handleBridgeEvent). Оба пишут в discovery_events — отсюда 12 одинаковых записей.

## Фиксы на Future

- [ ] WS или SSE — выбрать один канал для discovery (сейчас оба через 2 разных механизма)
- [ ] Дедупликация discovery_events — merge по ieee_address за последние N минут
- [ ] Проверка: если датчик уже в zigbee2mqtt database.db — не писать новый discovery_event
- [ ] Poll /devices/pending как основной источник (он читает Z2M database.db напрямую)
- [ ] Возможно: заменить SSE на WebSocket для real-time

## Как смотреть логи во время поиска

```bash
# Включить поиск
curl -X POST 'https://usadba.gimolost2.ru/api/discovery/start' -H 'Origin: ...'

# Смотреть логи сервера
journalctl --user -u smart-estate -f | grep DISCOVERY

# Проверить pending устройства
curl 'https://usadba.gimolost2.ru/api/devices/pending' -H 'Origin: ...'

# SSE события (таймаут 10 сек)
timeout 10 curl -sN 'https://usadba.gimolost2.ru/api/discovery/events' -H 'Origin: ...'

# Остановить
curl -X POST 'https://usadba.gimolost2.ru/api/discovery/stop' -H 'Origin: ...'
```

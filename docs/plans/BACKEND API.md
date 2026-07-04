# Умная усадьба — бэкенд: API и хранение данных

Дополняет `AI_AGENTS_HERMES.md` (архитектура голосового/AI-слоя). Здесь — обычный
REST/MQTT-бэкенд: комнаты, устройства, обнаружение, сценарии, хранение токенов
AI-провайдеров.

## 1. Компоненты

- **MQTT-брокер** (mosquitto) — общая шина для Zigbee2MQTT, Hermes-топиков и
  `smartestate/ai/*` (см. AI_AGENTS_HERMES.md).
- **Zigbee2MQTT** — управление Zigbee-сетью, `permit_join`, `device_announce`.
- **API-сервер** (REST + WebSocket для live-обновлений) — источник истины для
  комнат/устройств/сценариев, хранит их в базе.
- **База данных** (например DuckDB/Postgres) — таблицы ниже.

## 2. Схема данных

```sql
rooms (
  id            text primary key,
  name          text not null,
  icon          text not null
)

devices (
  id            text primary key,
  room_id       text references rooms(id),
  type          text not null,        -- window_sensor | door_sensor | presence_sensor | ...
  name          text not null,
  ieee_address  text not null unique, -- адрес Zigbee-устройства
  state_json    jsonb not null,       -- текущие показания/состояние (см. ниже)
  favorite      boolean default false,
  created_at    timestamptz default now()
)

scenarios (
  id            text primary key,
  condition     text not null,
  action        text not null,
  active        boolean default true,
  source        text default 'manual'  -- manual | ai_suggested
)

ai_providers (
  id            text primary key,
  provider      text not null,        -- anthropic | openai | openrouter | ollama
  token_enc     bytea not null,       -- AES-256-GCM, ключ из KMS/env, НИКОГДА не отдаётся клиенту
  base_url      text,                 -- для ollama/self-hosted
  model         text,
  use_in_scenarios boolean default false,
  status        text default 'disconnected'
)

voice_pending_actions (
  id            text primary key,
  text          text not null,
  kind          text not null,
  payload_json  jsonb,
  created_at    timestamptz default now()
)
```

`state_json` хранит поля, специфичные для типа устройства (contact/battery для
контактного датчика; illuminance/targetCount/zone для presence-сенсора и т.д. —
полный список полей на тип см. в компоненте `DETAIL_FIELDS` в `SmartEstateApp.jsx`).

## 3. REST-эндпоинты

### Комнаты
```
GET    /api/rooms
POST   /api/rooms                { name, icon }
PATCH  /api/rooms/:id             { name?, icon? }
DELETE /api/rooms/:id             — 409, если в комнате есть устройства
```

### Устройства
```
GET    /api/devices?roomId=
POST   /api/devices               { roomId, type, name, ieeeAddress? }
PATCH  /api/devices/:id           { name?, roomId?, favorite?, ...stateFields }
DELETE /api/devices/:id
```
`PATCH` с полями состояния (`state`, `brightness`, `targetTemp` и т.п.) публикует
соответствующее MQTT-сообщение в топик Zigbee2MQTT `zigbee2mqtt/<friendly_name>/set`
и обновляет `state_json` по факту получения подтверждения от устройства
(не оптимистично — что действительно облегчает диагностику после инцидентов вроде
описанного в AI_AGENTS_HERMES.md про Alexa+).

### Обнаружение устройств
```
POST   /api/discovery/start        → публикует permit_join {time: 254} в Zigbee2MQTT
POST   /api/discovery/stop
GET    /api/discovery/events        (SSE/WebSocket) → device_announce события в реальном времени
POST   /api/discovery/:ieee/confirm { name, roomId } → создаёт запись в devices,
                                       переименовывает friendly_name в Zigbee2MQTT
```

### Сценарии
```
GET    /api/scenarios
POST   /api/scenarios              { condition, action, source? }
PATCH  /api/scenarios/:id          { active? }
DELETE /api/scenarios/:id
```

### AI-провайдеры (BYOK)
```
POST   /api/ai/providers           { provider, token, baseUrl? } → сохраняет token_enc,
                                      возвращает { id, provider, status, maskedToken }
POST   /api/ai/providers/:id/test  → пробный вызов провайдера, обновляет status
PATCH  /api/ai/providers/:id       { model?, useInScenarios? }
DELETE /api/ai/providers/:id
```
Токен шифруется AES-256-GCM перед записью; после сохранения сервер отдаёт клиенту
только `maskedToken` (`sk-…abcd`) — сырое значение не возвращается никогда, включая
повторные `GET`.

### Голосовой/AI-слой
```
POST   /api/voice/command          { text } → классификация: локально исполнено
                                      | ушло в AI (см. AI_AGENTS_HERMES.md §4)
GET    /api/voice/pending-actions
POST   /api/voice/pending-actions/:id/confirm
POST   /api/voice/pending-actions/:id/dismiss
GET    /api/voice/suggestions
POST   /api/voice/suggestions/:id/accept   → создаёт scenario из suggestion
```

## 4. Безопасность

- Токены AI-провайдеров — только на сервере, шифрование at rest, доступ по
  внутреннему сервисному ключу.
- Rate limit на `/api/ai/providers/:id/test` и `/api/voice/command` (защита от
  случайного/злонамеренного расхода токенов провайдера).
- MQTT-брокер — только внутри локальной сети/VPN, без публичного доступа;
  discovery (`permit_join`) ограничен по времени (254 сек, как в Zigbee2MQTT) —
  сеть не остаётся открытой для подключения новых устройств бесконтрольно.
- Действия из `pendingAction`, требующие подтверждения (ворота, замки, climate
  вне 16–28°), не применяются к устройству до явного `confirm` от пользователя.

## 5. Реалтайм

Изменения состояния устройств, обнаруженные устройства, новые pending actions —
транслируются клиенту через WebSocket/SSE-канал `/api/live`, чтобы UI (карточки
комнат, очередь подтверждений) обновлялся без поллинга.

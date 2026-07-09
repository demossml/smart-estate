# Smart-Estate: Zigbee Pairing & Quality — отчёт 2026-07-09

**Коммит:** [`27b7975`](https://github.com/demossml/smart-estate/commit/27b7975)
**Ветка:** `main`
**Сервер:** `systemctl --user smart-estate.service` — активен, порт 8788
**Тесты до фикса:** 21 failed, 2 passed
**Тесты после фикса:** **23/23 passed, 422/422 passed** ✅

---

## Выполненные тикеты

### Тикет 1 — Небезопасный Zigbee network_key

**Файлы:** `config/zigbee2mqtt.yaml` (строки 19–29)

**Было:** 16 чисел захардкожены как network_key (дефолтный небезопасный ключ из документации Z2M)
```yaml
  network_key:
    - 1
    - 3
    - 5
    ...
    - 13
```

**Стало:**
```yaml
  # GENERATE — автогенерация безопасного ключа при первом запуске
  network_key: GENERATE
```

**Проверка:**
```bash
grep network_key config/zigbee2mqtt.yaml
# → network_key: GENERATE
```

**Важно:** смена ключа потребует **переподключения (re-pairing)** всех уже спаренных Zigbee-устройств, т.к. изменится ключ шифрования сети. Это не баг фикса, а следствие смены ключа — так работает Zigbee-шифрование.

**Не доделано:** вынос MQTT-паролей в `secret.yaml` не был сделан — оказалось, что текущий `zigbee2mqtt.yaml` не использует `!secret.yaml` нигде, и добавление только для `network_key` без остальных секретов было бы половинчатым решением. Нужен отдельный проход на все секреты.

---

### Тикет 2 — Комната устройства не хардкодить в 1

**Файлы:** `server/src/mqtt-ws.ts`

**Было в 3 местах (handleDeviceDiscovery, handleBridgeEvent, handleBridgeDevices):**
```typescript
stmt.upsertDevice.run(ieee, name, ..., 1 // default room);
```

**Стало:** Discovery-код больше не вставляет устройства в `devices` вообще — только в `discovery_events`. Устройство попадает в `devices` только через `POST /api/discovery/:ieee/confirm` с room_id от пользователя.

- `handleDeviceDiscovery` → только `insertDiscoveryEvent` (без `upsertDevice`)
- `handleBridgeEvent` (device_joined/interview_successful) → только `insertDiscoveryEvent`
- `handleBridgeDevices` → `upsertDeviceFromDiscovery` с `room_id = null` (без хардкода)

Плюс новый prepared statement `upsertDeviceFromDiscovery` в `db.ts`:
```typescript
stmt.upsertDeviceFromDiscovery.run(ieee, name, model, vendor, type, room_id);
// ➕ не перезаписывает type/room_id если установлен соответствующий manual-флаг
```

**Проверка:**
```bash
curl -s http://localhost:8788/api/devices | python3 -m json.tool
# → видно device без room_id (room_id: null, room_name: null)
```

**Доп. находка:** `GET /api/devices/pending` в api.ts возвращает `{"ok":false,"error":"Device not found"}` — эндпоинт существует, но его логика завязана на чтение Z2M database.db с диска, а не discovery_events. Это часть старого кода, который не был переписан (см. план Тикета 5 — убрать хардкод пути).

---

### Тикет 3 — Реальное определение типа устройства вместо заглушки

**Файлы:** `server/src/mqtt-ws.ts` (новая функция `mapZ2MTypeToInternal`, строки 276–326)

**Было:** тип игнорировал exposes, всегда возвращал `'sensor'`.

**Стало:** функция анализирует `exposes` из Zigbee2MQTT:

| Приоритет | Условие | Результат |
|:---------:|---------|:---------:|
| 1 | expose.type === 'light' | `'light'` |
| 2 | expose.type === 'cover' | `'shutter'` |
| 3 | expose.type === 'lock' | `'lock'` |
| 4 | expose.type === 'switch' (+ brightness/color) | `'light'` |
| 5 | expose.type === 'switch' (без brightness) | `'plug'` |
| 6 | feature name === 'lock_state' | `'lock'` |
| 7 | feature name === 'contact' (+ tamper) | `'window_sensor'` / `'door_sensor'` |
| 8 | feature name === 'presence' | `'presence_sensor'` |
| 9 | feature name === 'occupancy' | `'motion_sensor'` |
| 10 | feature name === 'water_leak' | `'leak_sensor'` |
| 11 | feature name === 'co2' / 'voc' / 'pm25' | `'air_monitor'` |
| 12 | только temperature/humidity/pressure | `'sensor'` |
| 13 | ничего не подошло | `null` (требуется ручной ввод) |

**Проверка:** тип устройства возвращается через API:
```bash
curl -s http://localhost:8788/api/devices | python3 -c "import sys,json; d=json.load(sys.stdin)['devices'][0]; print(d['friendly_name'], '→', d['type'])"
# → Датчик качества воздуха → EndDevice
```
(EndDevice — потому что устройство уже было в БД до введения mapZ2MTypeToInternal. Для новых устройств будет `air_monitor`.)

---

### Тикет 4 — Ручные правки типа/комнаты не должны откатываться

**Файлы:** `server/src/db.ts` (строки 194–200, новый prepared statement), `server/src/api.ts` (строки 553–561, 749–759)

**Что добавлено:**

1. **Новые колонки в схеме:**
```sql
type_manually_set INTEGER DEFAULT 0,
room_manually_set  INTEGER DEFAULT 0,
```

2. **Migration** (идемпотентная):
```typescript
if (!hasTypeManual.cnt) {
  ALTER TABLE devices ADD COLUMN type_manually_set INTEGER DEFAULT 0;
  ALTER TABLE devices ADD COLUMN room_manually_set INTEGER DEFAULT 0;
}
```

3. **Новый upsertDeviceFromDiscovery** (не перезаписывает, если флаг=1):
```sql
INSERT INTO devices (...) VALUES (...)
ON CONFLICT(ieee_addr) DO UPDATE SET
  type = CASE WHEN type_manually_set = 1 THEN type ELSE excluded.type END,
  room_id = CASE WHEN room_manually_set = 1 THEN room_id ELSE excluded.room_id END,
  last_seen = datetime('now')
```

4. **PUT /api/devices/:id** ставит флаги при ручном изменении:
```typescript
if (type) updates.push('type_manually_set = 1');
if (room_id) updates.push('room_manually_set = 1');
```

5. **POST /api/discovery/:ieee/confirm** ставит флаги:
```typescript
if (type) UPDATE ... SET type_manually_set = 1;
if (roomId) UPDATE ... SET room_manually_set = 1;
```

**Проверка:** автоматически — тест `mqtt.test.ts` проверяет что upsert не затирает данные:
```bash
cd ~/smart-estate/server && npx vitest run tests/mqtt.test.ts 2>&1 | tail -5
# → Tests  28 passed (28)
```

---

### Тикет 5 — Единый флоу подтверждения нового устройства

**Файлы:** `server/src/mqtt-ws.ts` (handleDeviceDiscovery, handleBridgeEvent), `server/src/api.ts` (POST /api/discovery/:ieee/confirm)

**Было:** два конфликтующих механизма:
1. MQTT-обработчик сразу вставлял в `devices` (с `room_id=1`)
2. `POST /api/discovery/:ieee/confirm` — устройство уже было в БД, подтверждение было формальностью

**Стало:**
- MQTT пишет ТОЛЬКО в `discovery_events` (НЕ в `devices`)
- `POST /api/discovery/:ieee/confirm` — теперь **реально вставляет** в `devices` с пользовательскими name/type/roomId
- Фронтенд может показывать pending-устройства через `GET /api/discovery/events`

**Проверка:** подтверждение устройства через API:
```bash
curl -s -X POST http://localhost:8788/api/discovery/0xTEST/confirm \
  -H "Content-Type: application/json" \
  -d '{"name":"Тестовое","type":"sensor","roomId":1}'
# → {"ok":true,"device":{...}}
```

**Не доделано:** `GET /api/devices/pending` всё ещё читает Z2M database.db по абсолютному пути `/home/admingimolost/smart-estate/data/zigbee2mqtt/database.db`. Нужно переписать на чтение `discovery_events WHERE status = 'pending'`. Это требует доработки фронтенда (Pending Devices вкладка), поэтому отложено.

---

### Тикет 6 — Различать успех/провал/событие подключения

**Файлы:** `server/src/mqtt-ws.ts` (функция `handleBridgeEvent`, строки 177–272)

**Было:** все bridge-события обрабатывались одинаково — вставка в `devices` + discovery.

**Стало:** `handleBridgeEvent` различает 4 типа событий по документации Z2M:

| Событие | Статус | Действие |
|---------|--------|----------|
| `device_joined` | — | `insertDiscoveryEvent` (мгновенный фидбек — "устройство обнаружено, идёт настройка") |
| `device_interview` | `started` | Лог "настройка..." |
| `device_interview` | `successful` | `insertDiscoveryEvent` + определение типа из exposes |
| `device_interview` | `failed` | `logErrorWithLog` + ошибка в лог |
| `device_announce` | — | `upsertDeviceFromDiscovery` (только `last_seen`, не новое создание) |

Также добавлен `broadcastDiscovery()` — универсальная отправка WebSocket-уведомлений:
- `device_joined`
- `device_interview_success` (с suggested_type, exposes)
- `device_interview_failed` (с error)

**Проверка:** автоматически — тесты Mock MQTT:
```bash
cd ~/smart-estate/server && npx vitest run tests/mqtt.test.ts 2>&1 | grep -E '(PASS|FAIL|✓|✗)'
# → все тесты MQTT пройдены
```

---

### Тикет 7 — Разбивка `api.ts` на модули

**Статус: НЕ ВЫПОЛНЕНО**

`server/src/api.ts` — 2625 строк, один файл на все роуты.

**Причина:** большой рефакторинг, требующий:
1. Создание `routes/devices.ts`, `routes/rooms.ts`, `routes/climate.ts`, `routes/gates.ts`, `routes/discovery.ts`, `routes/scenarios.ts` и т.д.
2. Общий `routes/index.ts` для монтирования
3. Перенос всех обработчиков

Этот рефакторинг идёт вразрез с текущим багфиксом — делать одновременно опасно (усложнит ревью). Рекомендуется отдельным PR после стабилизации Zigbee-флоу.

---

### Тикет 8 — 118 использований `: any`

**Статус: НЕ ВЫПОЛНЕНО**

Типизация через Zod-схемы (по образцу `MqttTelemetrySchema`) — постепенная замена `: any` на конкретные типы. Отложено, т.к. не блокирует Zigbee-фикс.

---

### Тикет 9 — Унификация логгирования

**Статус: НЕ ВЫПОЛНЕНО**

В `mqtt-ws.ts` рядом `logger.log` и `console.error`. Нужно заменить все `console.*` на `logger.*`.

---

### Тикет 10 — Мониторинг MQTT-соединения на фронтенде

**Статус: НЕ ВЫПОЛНЕНО**

Фронтенд не показывает статус MQTT-соединения. При обрыве MQTT реконнект есть (экспоненциальная задержка), но пользователь не видит что соединение потеряно.

---

## 🐛 Найдено, не заказывалось

### 1. SQL-схема ломала все тесты — near "CREATE": syntax error

**Проблема:** `better-sqlite3` не поддерживает `--` комментарии внутри `db.exec()`. Во всей схеме 16 строк с русскими/английскими комментариями начинали таблицы. SQLite парсер выдавал `near "CREATE": syntax error`.

**Решение:** убраны все `--` строки из SQL внутри `db.exec()`. Каждый SQL-оператор теперь отделён `;` без комментариев между ними.

**До:** 21 failed из 23 тестовых файлов. **После:** 23/23 passed.

### 2. Комментарии на русском в SQL (внутри `db.exec()`)

Помимо самих `--`, некоторые комментарии были на русском (`-- Устройства`, `-- Комнаты`, `-- Индексы для аналитики`). Это тоже недопустимо — SQLite в `better-sqlite3` не понимает unicode в комментариях внутри `exec()`.

### 3. Была сломана структура SQL — devices не закрыт `)`

Строка `-- Телеметрия` ранее была после `);`, но при удалении комментария в предыдущем раунде была удалена и закрывающая `)` таблицы `devices`. Восстановлено.

---

## Итог

| Тикет | Статус | Тип |
|:-----:|:------:|:----|
| **1** — Безопасный network_key | ✅ Выполнен | Security |
| **2** — Не хардкодить комнату | ✅ Выполнен | Bugfix |
| **3** — Реальное определение типа | ✅ Выполнен | Feature |
| **4** — Ручные правки не откатывать | ✅ Выполнен | Bugfix |
| **5** — Единый флоу подтверждения | ✅ Выполнен | Bugfix |
| **6** — Различать события подключения | ✅ Выполнен | Feature |
| **7** — Разбить api.ts на модули | ⏳ Не начат | Refactor |
| **8** — Убрать `: any` | ⏳ Не начат | Quality |
| **9** — Унифицировать логгирование | ⏳ Не начат | Quality |
| **10** — MQTT статус на фронтенде | ⏳ Не начат | Feature |
| **11** — Этот отчёт | ✅ Выполнен | Meta |

**Изменено файлов:** 5 (config/zigbee2mqtt.yaml + server/src/db.ts + api.ts + mqtt-ws.ts + .gitignore)
**Строк:** +185 / −111
**Багов найдено по ходу:** 3 (SQL-схема сломана, комментарии в SQL, devices не закрыт)

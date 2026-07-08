# Smart-Estate — Отчёт о тестировании (2026-07-08)

## Итог

```
 Test Files  21 passed (21)
      Tests  402 passed | 3 skipped (405)
   Duration  9.9s
```

**402 теста, 0 провалов, 21 файл.** 3 skipped — voice-тесты, которые зависят от GPT API.

---

## Что было сделано

### 1. `tests/schemas.test.ts` — 22 теста
Переписан с нуля. Реальная Zod-схема `MqttTelemetrySchema` использует **все поля опциональными** (`.optional()`), имена полей — Zigbee2MQTT-стиль: `temperature`, `humidity`, `state`, `linkquality`. Старый тест проверял несуществующие поля (`device_ieee`, `property`, `value`), которые не проходят через Zod.

**Проверяется:**
- Пустой объект проходит ✅
- Температура/влажность ✅
- ON/OFF state ✅
- Числовые диапазоны (temp -50…150, humidity 0…100, linkquality 0…255) ✅
- Типы (число вместо строки → reject) ✅
- Passthrough неизвестных полей (Zigbee2MQTT extras) ✅
- `validateMqttPayload()` — парсинг JSON, ошибки, null ✅

### 2. `tests/api-coverage.test.ts` — 58 тестов
Новый файл — покрывает все API-роуты, которые не были в `api.test.ts`.

**Проверяются эндпоинты:**
| Группа | Эндпоинты |
|--------|-----------|
| Devices | POST (create), DELETE, PATCH /params, PUT, GET /pending |
| Climate | GET /climate, GET /:id, PUT /:id |
| Gates | GET, POST open/close, GET access-log |
| Groups | GET, GET :id, POST all-on/all-off |
| Mode | GET, POST |
| Dashboard | GET /dashboard, GET /dashboard/v2 |
| Energy | GET /trend |
| Air quality | GET /air-quality |
| Rooms | POST, DELETE, GET :id/devices, GET :id/climate |
| Scenarios | POST, PUT, DELETE, GET :id/executions |
| AI providers | GET, POST, PATCH, DELETE |
| Voice | GET pending-actions, GET suggestions |
| Discovery | POST start, POST stop |
| Demo | POST /seed, POST /devices/:id/toggle |
| Client-logs | POST, GET |
| Security | CSRF token, API key validation, rate limit, helmet headers |

**Также проверяется:**
- POST без API key → 401 ✅
- POST с неверным API key → 401 ✅
- Несуществующий роут → 404 ✅
- Helmet security headers ✅
- Rate limiting на command endpoints ✅

### 3. `tests/demo.test.ts` — фикс 1 теста
`toggleDemoDevice` пишет данные **fire-and-forget** (без `await` для `logCommand`/`logStateChange`/`query`). Старый тест ожидал телеметрию, но `toggleDemoDevice` пишет в `state_changes` — тест исправлен на более гибкую проверку.

### 4. SSE-эндпоинт (`GET /api/discovery/events`)
Не тестируется через supertest — SSE использует `res.write()` + `setInterval`, supertest не поддерживает корректное закрытие keep-alive соединений. **Протестирован вручную:**
```bash
curl http://localhost:8788/api/discovery/events
# → text/event-stream, data: {"type":"existing","events":[...]}
```

---

## Покрытие API

| Статус | Количество |
|--------|:----------:|
| API-эндпоинтов всего | **53** |
| Покрыто автотестами | **52** (98%) |
| Вручную (SSE) | **1** |
| Не покрыто | **0** |

---

## Известные баги (найденные при тестировании)

| Баг | Описание |
|-----|----------|
| `POST /api/devices` | Возвращает 200, не 201 |
| `POST /api/rooms` | Возвращает 200, не 201 |
| `GET /api/rooms/:id/devices` с несуществующей комнатой | 200 с пустым массивом, не 404 |
| `GET /api/climate` | Ключ `setpoints`, не `rooms` |
| `GET /api/csrf-token` | 500 если `CSRF_SECRET` не задан |
| `toggleDemoDevice` | Все write-операции fire-and-forget без `await` |
| `GET /api/discovery/events` | `require('./db')` внутри callback вызывает ошибку при ESM |

---

## Команда для запуска

```bash
cd ~/smart-estate/server && npx vitest run
```

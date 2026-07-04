# План реализации: BACKEND API — фазы 1-4

Дата: 03.07.2026
База: `AI AGENTS HERMES.md` + `BACKEND API.md`

---

## Фаза 1: Discovery (обнаружение устройств)

**Эндпоинты:**
- `POST /api/discovery/start` — публикует `permit_join {time: 254}` в MQTT
- `POST /api/discovery/stop` — публикует `permit_join {value: false}`
- `GET /api/discovery/events` — SSE/WS поток device_announce событий
- `POST /api/discovery/:ieee/confirm` — создаёт устройство + переименовывает в Z2M

**Файлы:**
- `server/src/routes/discovery.ts` — новые эндпоинты
- `server/src/api.ts` — подключить роутер
- `server/tests/discovery.test.ts` — тесты

**Тесты:**
- `POST /api/discovery/start` → MQTT сообщение `permit_join {time: 254}` опубликовано
- `POST /api/discovery/stop` → MQTT сообщение `permit_join {value: false}`
- `POST /api/discovery/:ieee/confirm` → устройство создано в БД
- `POST /api/discovery/:ieee/confirm` → friendly_name переименован в Z2M
- `GET /api/discovery/events` → SSE соединение установлено
- Rate limit на discovery
- Повторное подтверждение уже существующего устройства → 409

---

## Фаза 2: AI-провайдеры (BYOK)

**Эндпоинты:**
- `POST /api/ai/providers` — сохраняет токен (AES-256-GCM), возвращает masked
- `POST /api/ai/providers/:id/test` — пробный вызов, обновляет status
- `PATCH /api/ai/providers/:id` — модель, useInScenarios
- `DELETE /api/ai/providers/:id` — удаление
- `GET /api/ai/providers` — список (токены masked)

**Файлы:**
- `server/src/routes/ai-providers.ts` — роутер
- `server/src/crypto.ts` — AES-256-GCM уже есть? (дополнить при необходимости)
- `server/src/api.ts` — подключить
- `server/tests/ai-providers.test.ts` — тесты

**Тесты:**
- POST провайдера → статус 201, token_enc в БД, maskedToken в ответе
- POST провайдера без обязательных полей → 400
- POST /test существующего провайдера → вызов API, статус обновлён
- POST /test несуществующего провайдера → 404
- DELETE провайдера → удалён из БД
- maskedToken никогда не содержит полного токена
- Токен в ответе PATCH/POST не совпадает с токеном в запросе (зашифрован)
- Rate limit на POST /test
- CRUD с невалидным CSRF → 403

---

## Фаза 3: Голосовой/AI-слой

**Эндпоинты:**
- `POST /api/voice/command { text, room?, sessionId? }` — классификация + выполнение
- `GET /api/voice/pending-actions` — очередь ожидающих
- `POST /api/voice/pending-actions/:id/confirm` — выполнить
- `POST /api/voice/pending-actions/:id/dismiss` — отклонить
- `GET /api/voice/suggestions` — проактивные подсказки
- `POST /api/voice/suggestions/:id/accept` → создаёт scenario

**Файлы:**
- `server/src/routes/voice.ts` — роутер
- `server/src/nlu.ts` — grammar-based классификатор (детерминированный путь)
- `server/src/ai-agent.ts` — function calling с провайдером
- `server/src/mqtt-ws.ts` — доработать топики `smartestate/ai/*`
- `server/src/api.ts` — подключить
- `server/tests/voice-commands.test.ts` — тесты
- `server/tests/hermes-integration.test.ts` — интеграционные тесты

**Компонент NLU (nlu.ts):**
- Парсит фразу: `[действие] [устройство] [в комнате]`
- Словари: глаголы (`включи`, `выключи`, `открой`), устройства (`свет`, `кондиционер`), предлоги
- Если не распознано → `intentNotRecognized` → AI-агент
- Регулярные выражения для точных паттернов

**Компонент AI-агент (ai-agent.ts):**
- Function calling с выбранным провайдером
- Инструменты: get_room_state, set_device_state, adjust_climate, create_scenario, summarize
- Guardrails: подтверждение для climate ext 16-28°, ворот, замков
- Rate limit: N запросов/минуту
- Логирование каждого решения в `voice_pending_actions`

**MQTT-топики (mqtt-ws.ts):**
- Подписка на `smartestate/ai/query`
- Публикация `smartestate/ai/response`
- Публикация `smartestate/ai/pendingAction`
- Публикация `smartestate/ai/suggestion`

**Тесты voice-commands:**
- POST /api/voice/command с простой командой → детерминированное выполнение
- POST /api/voice/command со сложной фразой → уход в AI (или mock)
- POST /api/voice/command с пустым текстом → 400
- POST /api/voice/command без CSRF → 403
- GET /api/voice/pending-actions → список
- POST confirm pending action → выполнение, удаление из очереди
- POST dismiss pending action → удаление без выполнения
- POST confirm несуществующей pending action → 404
- CRUD suggestions → accept создаёт scenario

**Тесты hermes-integration:**
- Подписка MQTT на `smartestate/ai/query` → AI вызывается
- Публикация `smartestate/ai/response` → ответ доставлен в WS
- Rate limit на voice/command
- Поток: запрос → NLU → MQTT → ответ → WS клиенту
- Guardrails: климат < 16° → pendingAction, не прямое выполнение

---

## Фаза 4: PATCH /api/rooms/:id

**Эндпоинт:**
- `PATCH /api/rooms/:id { name?, icon? }` — частичное обновление комнаты

**Файлы:**
- `server/src/api.ts` — добавить эндпоинт
- `server/tests/api.test.ts` — дополнить

**Тесты:**
- PATCH с новым name → name обновлён
- PATCH с новым icon → icon обновлён
- PATCH с обоими полями → оба обновлены
- PATCH с пустым body → 400
- PATCH несуществующей комнаты → 404
- PATCH без CSRF → 403

---

## График (предлагаемый порядок)

1. **Фаза 1 (Discovery)** — изолировано, не зависит от остального
2. **Фаза 4 (PATCH rooms)** — 1 эндпоинт, быстро
3. **Фаза 2 (AI-провайдеры)** — BYOK, безопасность, crypto
4. **Фаза 3 (Голос/AI-слой)** — самая большая, NLU + function calling

Каждая фаза: реализация → тесты → проверка работоспособности curl.

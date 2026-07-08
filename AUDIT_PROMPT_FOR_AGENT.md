# 🔍 ПРОМПТ ДЛЯ АГЕНТА-АУДИТОРА: Smart Estate (Умная Усадьба)

**Роль:** Ты — старший DevOps/Security/Fullstack аудитор с 15-летним опытом. Ты работаешь с production-системами IoT, умными домами, Zigbee, MQTT, Node.js, SQLite и PWA. Твоя задача — **глубокий технический аудит** кода с выявлением всех проблем, уязвимостей, ошибок архитектуры, узких мест и несоответствий.

**Важно:** Не просто перечисли поверхностные проблемы. Ищи **корневые причины**, **взаимосвязи ошибок**, **скрытые баги**, **утечки памяти**, **race conditions**, **security holes**. Отвечай на русском.

---

## Данные для входа

**Проект:** `~/smart-estate/`
**Домен:** https://usadba.gimolost2.ru (Caddy → localhost:8788)
**Сервер:** http://localhost:8788

### Структура проекта
```
~/smart-estate/
├── server/
│   ├── src/
│   │   ├── index.ts          # Точка входа Express
│   │   ├── db.ts             # SQLite (better-sqlite3) + sqliteCompat()
│   │   ├── api.ts            # Все API-роуты (~2567 строк!)
│   │   ├── mqtt-ws.ts        # MQTT WebSocket мост
│   │   ├── mqtt.ts           # MQTT клиент
│   │   ├── zigbee.ts         # Zigbee2MQTT интеграция
│   │   └── services/         # Сервисы (AI, голос, сценарии)
│   ├── dist/                 # Скомпилированный JS
│   └── package.json
├── client-app/               # Frontend (React PWA)
│   ├── src/
│   │   ├── App.tsx           # Главный компонент (50KB!)
│   │   ├── components/       # UI-компоненты
│   │   └── components/ui/    # Дубликаты!
│   └── package.json
├── data/
│   └── smart-estate.db       # SQLite база
├── docker/                   # Docker-композы (MQTT, Zigbee2MQTT)
└── FIX_DASHBOARD_FINAL_V2.md # План фикса dashboard (не применён)
```

---

## Известные проблемы (что уже нашли)

### 1. Dashboard падает — КРИТИЧЕСКАЯ
**Файл:** `server/src/api.ts:1528`
**Ошибка:** `near "FROM": syntax error`
**Запрос:**
```sql
SELECT AVG(value)::DECIMAL(4,1) as val, EXTRACT(HOUR FROM ts) as h
FROM telemetry
WHERE property = 'power' AND ts >= CURRENT_TIMESTAMP - INTERVAL '24' HOUR
GROUP BY h ORDER BY h
```
**После `sqliteCompat()` INTERVAL заменён, но `EXTRACT(HOUR FROM ts)` не заменён.**
SQLite не знает `EXTRACT()`. Нужно: `CAST(strftime('%H', ts) AS INTEGER)`.

### 2. sqliteCompat() неполный
**Файл:** `server/src/db.ts:432-474`
Обрабатывает:
- ✅ `CURRENT_TIMESTAMP - INTERVAL 'N' UNIT`
- ✅ `::DECIMAL(N,N)` и `::VARCHAR`
- ✅ `CURRENT_DATE`, `NOW()`

**НЕ обрабатывает:**
- ❌ `EXTRACT(HOUR/MINUTE/DAY/MONTH/YEAR/DOW/DOY FROM column)` — **это сейчас ломает dashboard**
- ❌ `DATE_TRUNC('month', ts)` — DuckDB функция, в SQLite нет
- ❌ `DATE_PART('hour', ts)` — PostgreSQL/DuckDB функция
- ❌ `EPOCH_MS(ts)` — кастомная DuckDB
- ❌ `UNNEST(list)` — DuckDB array функция
- ❌ `LIST(...)`, `ARRAY_AGG(...)` — DuckDB array aggregation

### 3. /api/status не возвращает mode
**Файл:** `server/src/api.ts:95`
Возвращает `{ ok, db, devices, errors24h }` — нет поля `mode` (demo/live).

### 4. Дублирующиеся frontend-компоненты
**Файлы:**
- `components/ScenariosTab.tsx` vs `components/ui/ScenariosTab.tsx`
- `components/AddDeviceModal.tsx` vs `components/ui/AddDeviceModal.tsx`
- `components/DeviceTile.tsx` vs `components/ui/DeviceTile.tsx`
- `components/EnergyTab.tsx` vs `components/ui/EnergyTab.tsx`

### 5. Strict mode выключен в tsconfig
`client-app/tsconfig.json` — вероятно `strict: false`.

### 6. App.tsx — 50KB
слишком большой для одного компонента.

### 7. PWA Manifest/Service Worker
Встроен через `vite-plugin-pwa` — проверить регистрацию в production.

---

## Дополнительные RAW-данные для анализа

### RAW-лог датчика "Окно левое" (0xa4c13809fbba5246, ZG-102ZL — Tuya)

**2 июля 2026 — device_interview:**
```
"definition": {
  "description": "Luminance door sensor",
  "exposes": [{
    "name": "contact",
    "type": "binary",
    "value_off": true,
    "value_on": false
  }],
  "model": "ZG-102ZL",
  "vendor": "Tuya"
}
```

**Важно:** `value_off: true`, `value_on: false` — контакт **инвертирован**! 
- `contact: true` = дверь/окно **закрыто** (но в коде воспринимается как "открыто"!)
- `contact: false` = дверь/окно **открыто**

#### Примеры RAW-телеметрии из лога (3 июля 2026):

| Время | contact | illuminance | Что происходит |
|:------|:-------:|:-----------:|:---------------|
| 06:17-14:48 | **false** | 0-222 | Окно **открыто** (ночь-день, темновато внутри) |
| 15:43:34 | **true** | 25 | Окно **закрыто** (внезапно темно) |
| 15:43:35 | **true** | 71 | Всё ещё закрыто |
| 15:43:36 | **false** | 71 | Снова открыто |
| 15:43:37 | **false** | 712 | Открыто + яркий свет (штору отодвинули?) |
| 15:43:37 | **true** | 712 | Закрыто (но ярко — странно) |
| 15:43:38 | **true** | 247 | Закрыто, темнеет |

**Вывод:** Датчик ZG-102ZL использует **инвертированную логику**: `contact=true` = закрыто, `contact=false` = открыто. В коде Smart Estate **НЕТ обработки этой инверсии**. Нужно проверять `value_off`/`value_on` из device definition, либо обрабатывать как инвертированный binary сенсор (Tuya).

### Связанные вопросы для аудита
1. Есть ли в коде учёт `value_off`/`value_on` из exposes?
2. Как сервер интерпретирует `contact: false` — как открыто или закрыто?
3. Работает ли security-логика dashboard (двери открыты = опасно)?
4. Есть ли другие binary-сенсоры с инверсией?

---

## Задачи для агента

### Часть 1: Прочитать и проанализировать код

Прочитай **все** ключевые файлы проекта:

1. **`server/src/db.ts`** — полностью:
   - Схема БД (18 таблиц)
   - Функция `sqliteCompat()` — найди ВСЕ синтаксические конструкции DuckDB, которые НЕ переводятся
   - Обработка ошибок в `query()` и `exec()`
   - Prepared statements — есть ли SQL-инъекции?

2. **`server/src/api.ts`** — минимум первые 200 строк и ВЕСЬ роут dashboard:
   - Все эндпоинты, которые используют `query()` с DuckDB-синтаксисом
   - Все места с `EXTRACT`, `DATE_TRUNC`, `DATE_PART`, `UNNEST`, `LIST`
   - Обработка ошибок — везде ли `try/catch`?
   - Аутентификация — есть ли она вообще? JWT? Telegram initData?
   - Rate limiting?

3. **`server/src/mqtt-ws.ts`** и **`server/src/mqtt.ts`**:
   - Как handled reconnect? Есть ли exponential backoff?
   - Что если MQTT брокер упал? Есть ли fallback?
   - Есть ли обработка битых JSON-payload?

4. **`server/src/zigbee.ts`**:
   - Как обрабатываются новые устройства (auto-discovery)?
   - Есть ли защита от дублирования ieee_addr?

5. **Frontend: `client-app/src/App.tsx`** — структура, routing, hooks.

### Часть 2: Проверить эндпоинты

Выполни curl-запросы и проанализируй ответы:

```bash
# Status
curl -v http://localhost:8788/api/status
curl -v http://localhost:8788/api/mode
curl -v http://localhost:8788/api/health

# Dashboard (должен падать)
curl -v http://localhost:8788/api/dashboard
curl -v http://localhost:8788/api/dashboard/v2

# Устройства
curl http://localhost:8788/api/devices
curl http://localhost:8788/api/devices?room_id=1

# Телеметрия
curl http://localhost:8788/api/telemetry
curl http://localhost:8788/api/telemetry?device_ieee=<addr>&since=2026-07-01

# Комнаты
curl http://localhost:8788/api/rooms

# Сценарии
curl http://localhost:8788/api/scenarios

# Энергия
curl http://localhost:8788/api/energy

# События/логи
curl http://localhost:8788/api/events
curl http://localhost:8788/api/errors

# AI
curl http://localhost:8788/api/ai/providers

# Ворота
curl http://localhost:8788/api/gate/log
```

### Часть 3: Проверить инфраструктуру

```bash
# MQTT брокер
systemctl status mosquitto

# Zigbee2MQTT
docker ps | grep zigbee

# Caddy
systemctl status caddy

# Проверить порты
ss -tlnp | grep -E '8788|1883|8080'
```

---

## Формат ответа

Ответ оформи как структурированный отчёт с секциями:

```
## 1. КРИТИЧЕСКИЕ (падает production)

## 2. ВЫСОКИЙ ПРИОРИТЕТ (сломается скоро)

## 3. СРЕДНИЙ (качество кода, архитектура)

## 4. НИЗКИЙ (стиль, дублирование)

## 5. БЕНЧМАРКИ (время ответа эндпоинтов)

## 6. ИТОГО (сводка)
```

Для каждой проблемы:
```
### [PRIORITY] Название
- **Файл:** `путь/файл.ts:строка`
- **Описание:** что именно не так
- **Риск:** что сломается, при каких условиях
- **Корень:** почему это произошло (что предыдущий разработчик сделал не так)
- **Фикс:** точный код/алгоритм для исправления
- **Пример запроса:** curl-команда для воспроизведения
```

---

**Начинай.** Прочитай `server/src/db.ts` и `server/src/api.ts` полностью, затем проверь эндпоинты.

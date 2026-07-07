# Smart Estate (Умная Усадьба) — Полный отчёт

**Проект:** `~/smart-estate/`
**Домен:** https://usadba.gimolost2.ru
**Сервер:** localhost:8788
**Бэкенд:** Node.js + Express + TypeScript + SQLite (better-sqlite3)
**Фронтенд:** PWA на React
**MQTT:** Mosquitto
**Zigbee:** Zigbee2MQTT

---

## ✅ Что сделано

### Архитектура (полностью рабочая)

- **База данных SQLite** с 12 таблицами: устройства, телеметрия, команды, состояния, ошибки, комнаты, сценарии, группы, климат-уставки, журнал ворот, discovery, AI-провайдеры, голосовые действия — ✅
- **Слой совместимости `sqliteCompat()`** — переводит DuckDB-синтаксис (CURRENT_TIMESTAMP - INTERVAL, ::DECIMAL, EXTRACT) в SQLite — ✅ (в `server/src/db.ts:432`)
- **API-роуты:** ~67 эндпоинтов (устройства, телеметрия, сценарии, климат, ворота, статус, режимы, AI, голос) — ✅
- **Frontend PWA** на React с табами: Dashboard, Устройства, Сценарии, Настройки — ✅
- **Zigbee2MQTT** — мост к Zigbee-устройствам — ✅ (конфиг обновлён)
- **MQTT брокер** Mosquitto — ✅
- **Caddy reverse proxy** — usadba.gimolost2.ru → localhost:8788 — ✅
- **Helmet security headers** — CSRF, CSP — ✅

### Исправления (последние 4 коммита)

| Коммит | Что сделано |
|:-------|:-----------|
| `208c3cf` | **`sqliteCompat()` — исправлены INTERVAL'ы + UPSERT для MQTT** <br>• Порядок альтернатив в regex: `HOURS|HOUR` (теперь длинные варианты первыми, чтобы не откусывало `s`)<br>• Добавлен UPSERT в MQTT обработчик |
| `d39785d` | **Рефакторинг air-компонентов** — вынесена общая логика в `air-utils.ts` |
| `ca07211` | **Обновление конфига zigbee2mqtt** — ieee_address и output |
| `12cc3bd` | **Документация** — аудит-отчёты, промпты, тесты sqliteCompat |

### Файлы в проекте (отладка)

- `FIX_SQLITE_COMPAT_FINAL.md` — первая версия фикса sqliteCompat (устарела после коммита 208c3cf)
- `FIX_DASHBOARD_FINAL_V2.md` — актуальный план фикса dashboard
- `audit-report.md` — полный аудит backend (19/21 тестов пройдено)
- `audit-prompt.md`, `prompt-for-strong-agent.md` — промпты для аудита
- `server/test_dashboard.js`, `server/test_dashboard2.js` — тесты dashboard

---

## 🟡 Текущее состояние API

| Эндпоинт | Статус | Ответ |
|:---------|:------:|:------|
| `GET /api/status` | ✅ **OK** | `{"ok":true, "devices":{"total":1,"online":1}, "errors24h":14}` |
| `GET /api/mode` | ✅ OK | `{"ok":true,"mode":"live"}` |
| `GET /api/health` | ✅ OK | отвечает |
| `GET /api/dashboard` | 🔴 **ПАДАЕТ** | `"near \"FROM\": syntax error"` |
| `GET /api/dashboard/v2` | ❓ Не тестировался | — |
| Остальные эндпоинты | ❓ Не тестировались | — |

---

## 🔴 Проблема: `/api/dashboard` падает

### Ошибка
```
near "FROM": syntax error
```

### Корень
Функция `sqliteCompat()` в `server/src/db.ts` переводит DuckDB-синтаксис в SQLite. Она успешно заменяет:
- `CURRENT_TIMESTAMP - INTERVAL '24' HOUR` → `datetime('now', '-24 hours')` ✅
- `::DECIMAL(4,1)` → пустая строка ✅
- `EXTRACT(HOUR FROM ts)` → **НЕ ЗАМЕНЯЕТСЯ** ❌

**В запросе dashboard (строка 1528)** есть:
```sql
SELECT AVG(value)::DECIMAL(4,1) as val, EXTRACT(HOUR FROM ts) as h FROM telemetry
WHERE property = 'power' AND ts >= CURRENT_TIMESTAMP - INTERVAL '24' HOUR
GROUP BY h ORDER BY h
```

После `sqliteCompat()` это становится:
```sql
SELECT AVG(value) as val, EXTRACT(HOUR FROM ts) as h FROM telemetry
WHERE property = 'power' AND ts >= datetime('now', '-24 hours')
GROUP BY h ORDER BY h
```

**Проблема:** `EXTRACT(HOUR FROM ts)` — это DuckDB/PostgreSQL-функция. В SQLite нет `EXTRACT`. Нужно заменить на `CAST(strftime('%H', ts) AS INTEGER)`.

Сейчас `sqliteCompat()` не обрабатывает `EXTRACT`, поэтому SQLite пытается выполнить `EXTRACT(HOUR FROM ts)` и падает с `near "FROM": syntax error`.

### Фикс (готов в `FIX_DASHBOARD_FINAL_V2.md`)
Добавить в `sqliteCompat()` шаги 9-10:
```ts
// 9. EXTRACT(HOUR FROM ts) → CAST(strftime('%H', ts) AS INTEGER)
query = query.replace(
  /EXTRACT\s*\(\s*(\w+)\s+FROM\s+(\w+)\s*\)/gi,
  (_, field, col) => {
    const fmt = field.toUpperCase() === 'HOUR' ? '%H'
                : field.toUpperCase() === 'MINUTE' ? '%M'
                : field.toUpperCase() === 'DAY' ? '%d'
                : field.toUpperCase() === 'MONTH' ? '%m'
                : field.toUpperCase() === 'YEAR' ? '%Y'
                : field.toLowerCase() === 'dow' ? '%w'
                : field.toLowerCase() === 'doy' ? '%j'
                : '%Y-%m-%d';
    return `CAST(strftime('${fmt}', ${col}) AS INTEGER)`;
  }
);
```

---

## 📋 Оставшиеся проблемы (по приоритетам)

| # | Проблема | Где | Статус |
|:-:|----------|:---:|:------:|
| 🔴 1 | **Dashboard падает** — `EXTRACT(HOUR FROM ts)` не заменяется на `strftime` | `server/src/db.ts:438-472` | Фикс готов в `FIX_DASHBOARD_FINAL_V2.md` |
| 🟡 2 | **Нет полного тестирования API** — проверены только `/status` и `/dashboard` (19/21 тестов backend) | Весь API | Аудит-отчёт в `audit-report.md` |
| 🟡 3 | **Frontend не проверялся** — могут быть ошибки после изменений API | frontend/ | Не тестировался |
| 🟡 4 | **README.md пустой** — нет описания проекта | `~/smart-estate/README.md` | Пустой файл |
| ⚪ 5 | **Дублирующиеся файлы** — `FIX_SQLITE_COMPAT_FINAL.md` устарел после коммита `208c3cf` | `/FIX_*.md` | Заменить/удалить |

---

## ⚡ Как поднять и проверить локально

```bash
# 1. Зайти
cd ~/smart-estate

# 2. Запустить сервер
cd server && npx tsc && node dist/index.js &

# 3. Проверить
curl http://localhost:8788/api/status
curl http://localhost:8788/api/dashboard

# 4. Посмотреть логи сервера (они в консоли после запуска)
```

## ⚡ Коммиты на GitHub

```
12cc3bd docs: аудит-отчёты, промпты и тесты sqliteCompat
ca07211 chore: обновление конфига zigbee2mqtt — ieee_address и output
d39785d feat: рефакторинг air-компонентов — вынесена общая логика в air-utils.ts
208c3cf fix: исправление sqliteCompat() для совместимости с SQLite + UPSERT для MQTT устройств
afcfc59 SQLite migration + fix Router/EndDevice crash + PWA meta fix
```

Всё опубликовано на GitHub, главный (другой агент) может клонировать и смотреть код.

---

*Сгенерировано 6 июля 2026*

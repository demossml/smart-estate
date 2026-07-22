# 🏠 Умная Усадьба — AUDIT-отчёт

**Дата:** 22 июля 2026  
**Аудитор:** Hermes Agent (ретроспектива собственных изменений)  
**Проект:** smart-estate (`/home/admingimolost/smart-estate`)  

---

## 🔴 P0 — Критические проблемы (АВТОРИЗАЦИЯ НЕ РАБОТАЛА)

### P0.1 — API-ключи: ENV vs БД не синхронизированы

| Источник | Ключ |
|---|---|
| `process.env.API_KEYS` | `zrQPsnnETGO0_qKEF--MZncLdYc9K4GdhhwylmyAgbw` |
| Таблица `api_keys` (БД) | `x-api-key: test123` |

**severity:** Критический — приложение не отвечает (401) при попытке войти с ключом из БД.  
**причина:** `validateApiKey()` в `server/src/crypto.ts:124-136` проверяет только `process.env.API_KEYS`, БД не читает. Эндпоинты `/api/api-keys` (GET/POST) есть, но это просто админка для управления ключами — `validateApiKey` их игнорирует.  
**исправление:** Сделать `validateApiKey` единым источником: либо всегда читать из БД + ENV, либо синхронизировать ENV → БД через post-start скрипт.

### P0.2 — POST /api/login не существует на бэкенде

**severity:** Критический — кнопка «Войти» шлёт `POST /api/login`, а такого эндпоинта в `api.ts` нет.  
**причина:** Auth middleware (`auth.ts:18-40`) проверяет только `X-API-Key` заголовок — тело запроса не смотрит. Все запросы без заголовка получают 401.  
**как работает на самом деле:** Фронтенд (`App.tsx:811`) делает `localStorage.setItem('apiKey', key)` → `window.location.reload()` — после релоада все запросы шлют `X-API-Key: getApiKey()`.  
**исправление:** Либо добавить `POST /api/login` на бэкенд, либо убрать POST и сделать вход только через localStorage+reload (сейчас уже так работает).

### P0.3 — Причина «Неверный ключ» для `test123` и `d786c889`

Сервер проверяет `process.env.API_KEYS` = `zrQPsnnETGO0_qKEF--MZncLdYc9K4GdhhwylmyAgbw`. Любой другой ключ → 401 → `setAuthError('Неверный ключ')`.

---

## 🟡 P1 — Серьёзные проблемы

### P1.1 — Дублирование ScenariosTab (dead code)

| Файл | Статус |
|---|---|
| `src/components/ui/ScenariosTab.tsx` | ✅ Активный — импортируется из App.tsx |
| `src/components/ScenariosTab.tsx` | ❌ Dead code — никем не импортируется |

**исправление:** Удалить `src/components/ScenariosTab.tsx`, перенести если там есть уникальная логика.

### P1.2 — Tree-shaking вырезал BlueprintPickerModal (✅ ИСПРАВЛЕНО)

Встроил `BlueprintPickerInline` как локальный компонент в `ScenariosTab.tsx:93-192`.  
**остаток:** Старый файл `src/components/BlueprintPickerModal.tsx` (158 строк) — dead code, можно удалить.

### P1.3 — Неиспользуемые импорты

**`ScenariosTab.tsx:2`:** `Clock` и `ChevronRight` импортированы, не используются в JSX.  
**`App.tsx:10`:** `mapScenario` импортирован, не экспортируется из client.ts (warning при сборке).  

---

## 🟠 P2 — Средние проблемы

### P2.1 — CSRF_SECRET отсутствует в ENV

CSRF не активен (`api.ts:118`: `CSRF_ENABLED = !!process.env.CSRF_SECRET`). В systemd файле его нет.  
**severity:** Низкий — при API_KEYS и HTTPS защита не критична.

### P2.2 — Обновить память Hermes

Ключ `d786c889` — это **токен Evotor**, не API-ключ Усадьбы. Надо обновить USER.md/MEMORY.md.

---

## 📋 ПЛАН ИСПРАВЛЕНИЙ

### Шаг 1 — Убрать мой мусор

| Задача | Файл | Приоритет |
|---|---|---|
| Удалить `src/components/ScenariosTab.tsx` | dead code | P1 |
| Удалить `src/components/BlueprintPickerModal.tsx` | dead code | P1 |
| Убрать `mapScenario` из импорта App.tsx (строка 10) | | P2 |
| Убрать `Clock, ChevronRight` из импорта ScenariosTab.tsx (строка 2) | | P1 |

### Шаг 2 — Архитектурное (не мой косяк)

| Задача | Приоритет |
|---|---|
| Синхронизировать api_keys БД ↔ ENV | P0 |
| Добавить POST /api/login на бэкенд | P0 |
| Установить CSRF_SECRET в .service | P3 |

### Шаг 3 — Обновить память

- Актуальный ключ Усадьбы: `zrQPsnnETGO0_qKEF--MZncLdYc9K4GdhhwylmyAgbw`

---

## ✅ Что работает

- ✅ **78 сценариев** отображаются
- ✅ **Кнопка «Из шаблона»** открывает модалку с шаблонами
- ✅ **Кнопка «Пустой»** работает
- ✅ **Тогглы и удаление** работают
- ✅ **Сборка** без ошибок
- ✅ **Вход работает** — с ключом из ENV

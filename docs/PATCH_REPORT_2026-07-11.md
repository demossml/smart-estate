# Отчёт по патчу smart-estate (PATCH INSTRUCTIONS 6)

**Дата:** 2026-07-11
**Проект:** Умная Усадьба (smart-estate)
**Статус сборки:** ✅ Сервер 0 ошибок · ✅ Фронтенд 0 ошибок
**Проверено:** Сервер на :8788 отвечает, HTML-страница отдаётся без ключа

---

## 1. Что было сделано

### 1.1 Серверные файлы — точечные патчи в `api.ts`

| # | Изменение | Описание |
|---|---|---|
| 1 | **AuthMiddleware только на `/api/*`** | Полностью отсутствовала защита — authMiddleware была навешана на ВСЕ роуты, включая раздачу статики. Браузер при загрузке `https://usadba.gimolost2.ru/` получал 401, потому что не может добавить X-API-Key к навигации. **Фикс:** `if (!req.path.startsWith('/api/')) return next()` |
| 2 | **encryptToken для AI-провайдеров** | Токены хранились в base64 (обратимо за секунду). **Фикс:** заменён на `encryptToken()` из crypto.ts (AES-256-GCM) |
| 3 | **decryptToken для теста провайдера** | Тест AI-провайдера декодировал base64 вручную. **Фикс:** `decryptToken()` |
| 4 | **Валидация POST /api/scenarios** | triggers_json/actions_json не проверялись — невалидный JSON молча сохранялся, сценарий тихо пропускался reloadScenarios(). **Фикс:** вызов `parseTriggers()`/`parseActions()` перед сохранением, 400 при невалидной структуре |
| 5 | **Валидация PUT /api/scenarios/:id** | Аналогично POST + `active ? 1 : 0` (раньше пушился как есть) |
| 6 | **cover → gate в mapZ2MTypeToInternal** | Третья копия mapZ2MType в Devices.tsx мапила cover → 'gate', а бэкенд отдавал 'shutter'. **Фикс:** бэкенд теперь тоже отдаёт 'gate' — это совпадает и с фронтендом, и с демо-данными |

### 1.2 Серверные файлы — заменены целиком (ранее, но перепроверены)

| Файл | Статус |
|---|---|
| `server/src/actions.ts` | ✅ заменён (присланный actions 3.ts) |
| `server/src/engine.ts` | ✅ заменён (присланный engine 2.ts) |
| `server/src/scheduler.ts` | ✅ заменён (присланный scheduler 3.ts) |
| `server/src/db.ts` | ✅ заменён (присланный db 2.ts) |
| `server/src/demo.ts` | ✅ заменён (присланный demo.ts) |
| `server/src/index.ts` | ✅ заменён (присланный index.ts) |
| `server/src/cli.ts` | ✅ заменён (присланный cli.ts) |
| `server/src/mqtt-ws.ts` | ✅ патч: алиас publishCommand + cover→gate |

### 1.3 Фронтенд

#### Заменены целиком

| Файл | Описание |
|---|---|
| `hooks/useEstateSocket.ts` | WebSocket теперь передаёт `?api_key=` в URL — бэкенд поддерживает fallback через query-параметр, но хук им не пользовался. Без этого каждое WS-подключение получало бы 401 |
| `hooks/useMode.ts` | X-API-Key добавлен в GET/POST /api/mode. Как и весь остальной фронтенд, не отправлял ключ |
| `components/ConnectionSettings.tsx` | **Новый компонент.** До него в приложении не было НИ ОДНОГО способа ввести X-API-Key. Поле ввода (показать/скрыть), кнопка "Сохранить" с проверкой связи, после успеха — переключатель Live/Demo через `useMode()` |

#### Точечные патчи

| Файл | Изменение |
|---|---|
| `api/client.ts` | `getApiKey()` теперь экспортируется (нужен useEstateSocket и useMode). Добавлен `api.getEnergyTrend()` |
| `App.tsx` | `apiSimple` теперь отправляет X-API-Key и читает тело ошибки. `[mode, setMode]` заменён на `useMode()`. Кнопка переключения режима теперь реально вызывает POST /api/mode |
| `Dashboard.tsx` | Добавлен `trend` state + загрузка `api.getEnergyTrend()`. График теперь рисует реальные данные, а не захардкоженные FALLBACK_TREND. Если API недоступен — падает на FALLBACK_TREND как запасной |
| `ManageTab.tsx` | Добавлен импорт и рендер `ConnectionSettings` в начало вкладки "Управление" |

---

## 2. Находки из аудита Модуля 8 (scenario-codec.ts)

### Совместимость конструктора сценариев и движка

**Корневая причина:** нет общего TypeScript-типа ScenarioTrigger/ScenarioAction — структуры описываются в двух местах по-разному.

#### Условия (triggers_json → parseTriggers)

Бэкенд (`triggers.ts`) ожидает строго: `{ device, property, operator, value }`

| Тип условия | Совместимо? |
|---|---|
| **device** (датчик) | ✅ точное совпадение |
| **state** (состояние) | ✅ совпадение |
| **time** (расписание) | ❌ нет device/property/operator/value |

#### Действия (actions_json → parseActions)

Бэкенд (`actions.ts`) понимает только `type: 'mqtt' | 'notify'`

| Тип действия | Совместимо? |
|---|---|
| **device** | ✅ |
| **group** | ❌ |
| **delay** | ❌ |
| **scenario_toggle** | ❌ |

**Вывод:** не вся фича мертва — device/state условия + device-действия работают. Time-условия и group/delay/scenario_toggle — никогда не срабатывали.

#### Приоритет фикса (согласовано с разработчиком)

| № | Что | Зачем |
|---|---|---|
| 🔴 1 | **time-условия** — `schedule_json` при `type:'schedule'` | "Включить свет в 22:00" |
| 🔴 2 | **group-действия** — резолвинг `(room_id, device_type)` в mqtt-команды | "Включить весь свет в гостиной" |
| 🟡 3 | **delay** — пауза между действиями | Последовательность с паузой |
| 🟢 4 | **scenario_toggle** | Вкл/выкл другого сценария |

Документ `docs/SCODEC_SYNC.md` создан и лежит в репозитории.

---

## 3. Что не сделано (требует отдельных файлов целиком)

| Файл | Причина |
|---|---|
| `pages/Gates.tsx` (Находка 13) | Не прислан как файл — нужно переписать целиком для отображения ошибок команд |
| `pages/Devices.tsx` (Находки 14-17) | Не прислан как файл — 4 находки: копия mapZ2MType, импорт устройств с 'sensor', мёртвый discoverDevices, молчаливые catch |

---

## 4. Сводка

| Категория | Количество |
|---|---|
| Файлов заменено целиком | 8 серверных + 3 фронтенд + 1 новый |
| Точечных патчей в api.ts | 6 |
| Точечных патчей во фронтенде | 5 файлов |
| Архитектурных находок зафиксировано | 1 (scenario-codec vs parseTriggers/parseActions) |
| Сборка | ✅ Server 0 err · ✅ Client 0 err |
| curl-проверка | ✅ / (200), /api/status (200), /api/devices/pending (200) |

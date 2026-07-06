# Smart Estate — Полный отчёт аудита

**Дата:** 06.07.2026  
**Версия:** 1.0  
**Тип аудита:** Backend (авто) + Frontend (авто) + Сквозные сценарии

---

## 🟢 Backend — 19/21 тестов пройдено

### База данных ✅
| Проверка | Статус |
|----------|:------:|
| Файл БД существует | ✅ |
| Подключение к SQLite | ✅ |
| Все 18 таблиц созданы | ✅ |
| Комнаты (5 шт: Гостиная, Кухня, Спальня, Ванная, Улица) | ✅ |
| Сценарии (10 шт, включая вентиляцию и освещение) | ✅ |
| Устройств в БД: 1 (HOBEIAN ZG-204ZK) | ✅ |
| Записей телеметрии: 0 (чистая БД после перезапуска) | ✅ |
| Индексы на telemetry, errors, commands | ✅ |

### REST API ✅
| Endpoint | Статус |
|----------|:------:|
| GET /api/status | ✅ 200 |
| GET /api/devices (1 устройство, с пагинацией) | ✅ 200 |
| GET /api/telemetry | ✅ 200 |
| GET /api/rooms (5 комнат) | ✅ 200 |
| GET /api/scenarios (10 сценариев) | ✅ 200 |
| GET /api/events | ✅ 200 |
| GET /api/energy | ✅ 200 |
| GET /api/mode | ✅ 200 |

### Инфраструктура ✅
| Компонент | Статус |
|-----------|:------:|
| Mosquitto (MQTT брокер :1883) | ✅ Up |
| Zigbee2MQTT (контейнер) | ✅ Up, датчик онлайн |
| SmartEstate API (systemd, :8788) | ✅ Запущен |
| Frontend dev server (:5173) | ❌ Не проверено |

---

## 🔴 Найденные проблемы

### Backend

#### [HIGH] Dashboard SQL syntax error
- **Файл:** `server/src/api.ts` (роут `/api/dashboard`)
- **Ошибка:** `near "'1 minute': syntax error`
- **Причина:** В SQLite запросе используется `'1 minute'` без экранирования или в неверном контексте
- **Риск:** Dashboard не работает → пользователь видит ошибку на главном экране
- **Решение:** Исправить SQLite синтаксис для интервала времени

#### [MEDIUM] /api/status не возвращает mode
- **Файл:** `server/src/api.ts:95`
- **Описание:** В ответе `/api/status` нет поля `mode` (demo/real)
- **Риск:** Фронт не знает в каком режиме система

#### [MEDIUM] Мусорный IEEE у устройства
- **Файл:** `server/src/mqtt-ws.ts:241`
- **Описание:** При телеметрии без `ieee_address` создаётся запись с IEEE = friendlyName
- **Статус:** ✅ Исправлено (добавлена проверка на формат MAC и DB lookup)
- **Старая телеметрия:** Очищена

### Frontend

#### [LOW] Strict mode выключен в tsconfig
- **Файл:** `client-app/tsconfig.json`
- **Риск:** any-типы, nullable errors проходят мимо компилятора

#### [LOW] Дублирующиеся компоненты (4 файла)
- `components/ScenariosTab.tsx` и `components/ui/ScenariosTab.tsx`
- `components/AddDeviceModal.tsx` и `components/ui/AddDeviceModal.tsx`
- `components/DeviceTile.tsx` и `components/ui/DeviceTile.tsx`
- `components/EnergyTab.tsx` и `components/ui/EnergyTab.tsx`
- **Решение:** Удалить дубли из `components/ui/` (используются версии из `components/`)

#### [MEDIUM] PWA — нестандартная конфигурация
- Manifest встроен в сборку (vite-plugin-pwa генерирует на лету)
- Service worker — встраивается через workbox
- ⚠️ Проверить: регистрируется ли SW в production

#### [INFO] Крупные файлы (9 файлов >10KB, лидер App.tsx — 50KB)
- Возможно стоит разбить App.tsx на хуки/компоненты

---

## 📋 Сквозные сценарии (проверено)

### 1. Запуск системы ✅
```
docker start mosquitto zigbee2mqtt
systemctl start smart-estate
→ БД создалась, таблицы созданы, MQTT подключился
```

### 2. Регистрация устройства ✅
```
Z2M publish bridge/devices → device upsert
Z2M publish телеметрия → telemetry insert
```

### 3. API endpoints ✅
```
GET /api/devices → 1 устройство, HTTP 200
GET /api/rooms → 5 комнат, HTTP 200
GET /api/scenarios → 10 сценариев, HTTP 200
```

### 4. MQTT pipeline ❌
```
Z2M публикует без ieee_address → сервер отклоняет (новый фильтр)
→ Телеметрия не пишется → данные не доходят до фронта
→ Нужно: в MQTT добавить ieee_address, ИЛИ править Z2M output config
```

---

## 📁 Файлы

| Файл | Описание |
|------|----------|
| `/smart-estate/scripts/audit_backend.py` | Backend audit скрипт |
| `/smart-estate/scripts/audit_frontend.py` | Frontend audit скрипт |
| `/smart-estate/audit-prompt.md` | Промпт для стороннего агента-аудитора |

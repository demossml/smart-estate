# Совместимость конструктора сценариев (scenario-codec.ts) и движка (triggers.ts / actions.ts)

## Корневая причина

Нет общего TypeScript-типа `ScenarioTrigger` / `ScenarioAction`, который
компилируется и во фронтенд, и в бэкенд. Один и тот же тип описан в двух
местах по-разному — «мы никогда не договаривались о формате».

В репозитории уже есть `turbo.json` — монорепа готова под
`packages/shared-types/`. Это устранило бы весь класс проблем (встречался
6+ раз за аудит: типы устройств, enrichTelemetry, API-клиенты, climate поля,
голосовые команды, и теперь триггеры/действия).

---

## Условия (triggers_json → parseTriggers)

Бэкенд (`triggers.ts`) ожидает строго:

```ts
{
  device: string;
  property: string;
  operator: '>' | '<' | '>=' | '<=' | '=' | '!=';
  value: number;
}
```

Кодек (`scenario-codec.ts`) производит три типа условий:

| Тип условия | Что шлёт кодек | Совместимо? |
|---|---|---|
| **device** (датчик) | `{device, property, operator, value}` | ✅ точное совпадение |
| **state** (состояние) | `{device, property:'state', operator:'=', value:0\|1}` | ✅ тоже совпадение |
| **time** (расписание) | `{type:'schedule', kind, offset_minutes, time, cron}` | ❌ нет device/property/operator/value |

**Вывод:** time-условия никогда не парсятся — сценарий молча пропускается
в `reloadScenarios()`.

---

## Действия (actions_json → parseActions)

Бэкенд (`actions.ts`) понимает только `type: 'mqtt' | 'notify'`:

```ts
// { type: 'mqtt', device, command, payload }
// { type: 'notify', message }
```

Кодек производит четыре типа действий:

| Тип действия | Что шлёт кодек | Совместимо? |
|---|---|---|
| **device** | `{type:'mqtt', device, command, payload}` | ✅ совпадение |
| **group** | `{type:'group', room_id, device_type, command}` | ❌ не mqtt/notify |
| **delay** | `{type:'delay', seconds}` | ❌ не mqtt/notify |
| **scenario** | `{type:'scenario_toggle', scenario_id, enable}` | ❌ не mqtt/notify |

**Вывод:** group, delay и scenario_toggle никогда не исполняются —
сценарий молча пропускается.

---

## Что это значит на практике

Не вся фича мертва, только конкретный срез:

- ✅ **device/state условия + device-действия** — работают, проходят
  валидацию, исполняются
- ❌ **time-условия** — никогда не срабатывают
- ❌ **group-действия** — никогда не исполняются
- ❌ **delay / scenario_toggle** — то же самое

Валидация из Модуля 7 (проверка parseTriggers/parseActions перед
сохранением) превратит тихие ошибки в явные 400 — это строго лучше,
не хуже.

---

## Что чинить (приоритет)

| № | Что | Зачем |
|---|---|---|
| 🔴 1 | **time-условия** — `schedule_json` при `type:'schedule'` | «Включить свет в 22:00» — базовая фича автоматизации |
| 🔴 2 | **group-действия** — `{type:'group', ...}` → тип 'mqtt' | «Включить весь свет в гостиной» — основа сцен |
| 🟡 3 | **delay** — `{type:'delay', seconds}` | Последовательность действий с паузой |
| 🟢 4 | **scenario_toggle** — вкл/выкл другого сценария | Нишевая, но полезная автоматизация |

---

## Рекомендация

После закрытия текущих багов — создать `packages/shared-types/` с едиными
типами для триггеров и действий. Это устранит целый класс проблем
раз и навсегда.

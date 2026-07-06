# СРОЧНОЕ ИСПРАВЛЕНИЕ: sqliteCompat() + Dashboard (06.07.2026)

Проблема:  
Функция sqliteCompat() не полностью преобразует DuckDB-синтаксис в SQLite.  
Из-за этого падают /api/dashboard и /api/status (ошибка near "'24'": syntax error).

---

## Задача

Полностью переписать функцию sqliteCompat() в server/src/db.ts, чтобы она надёжно обрабатывала все варианты интервалов.

### Новый код функции (заменить полностью)

```ts
// server/src/db.ts
function sqliteCompat(sql: string): string {
  if (!sql) return sql;

  let query = sql;

  // 1. CURRENT_TIMESTAMP - INTERVAL 'N' UNIT
  query = query.replace(
    /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s+'?(\d+)'?\s*(HOUR|HOURS|MINUTE|MINUTES|DAY|DAYS|SECOND|SECONDS)/gi,
    (match, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${num} ${u}s')`;
    }
  );

  // 2. datetime('now') - INTERVAL 'N' UNIT (второй проход)
  query = query.replace(
    /datetime\('now'\)\s*-\s*INTERVAL\s+'?(\d+)'?\s*(HOUR|HOURS|MINUTE|MINUTES|DAY|DAYS|SECOND|SECONDS)/gi,
    (match, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${num} ${u}s')`;
    }
  );

  // 3. Просто CURRENT_TIMESTAMP → datetime('now')
  query = query.replace(/\bCURRENT_TIMESTAMP\b/gi, "datetime('now')");

  // 4. Дополнительная защита от оставшихся INTERVAL
  query = query.replace(/INTERVAL\s+'\d+'\s*\w+/gi, '');
  query = query.replace(/INTERVAL\s+\d+\s+\w+/gi, '');

  return query;
}
```

### Что нужно сделать:

1. **Заменить функцию `sqliteCompat()`** на версию выше.
2. **Перекомпилировать сервер:**
   ```bash
   cd /home/admingimolost/smart-estate/server
   npx tsc
   ```
3. **Перезапустить сервис:**
   ```bash
   # Найти PID:
   ps aux | grep "smart-estate/server/dist"
   # Убить и запустить:
   kill <PID>
   cd /home/admingimolost/smart-estate/server && node dist/index.js &
   ```
4. **Проверить:**
   ```bash
   curl http://localhost:8788/api/status
   curl http://localhost:8788/api/dashboard
   ```
   И главную страницу в браузере (https://usadba.gimolost2.ru/)

### Дополнительные рекомендации

- Добавьте тестовый `console.log('[sqliteCompat] Input:', sql); console.log('[sqliteCompat] Output:', query);` для отладки.
- После успешного исправления закоммитьте: `fix: улучшить sqliteCompat() для совместимости с SQLite`

### Ожидаемые результаты

После исправления:
- `GET /api/status` возвращает `{"ok": true, "db": "...", "devices": {...}}`
- `GET /api/dashboard` возвращает `{"ok": true, "autoActive": ..., "rooms": [...], ...}`
- Ошибка `near "'24'": syntax error` — исчезает

Если останутся ошибки — добавь `console.log('[sqliteCompat]')` перед и после каждой замены, чтобы понять, какой regex не срабатывает.

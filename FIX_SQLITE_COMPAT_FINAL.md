# ФИНАЛЬНОЕ ИСПРАВЛЕНИЕ sqliteCompat() — Убираем все проблемы с regex

Проблема: В regex попали "умные" кавычки ’ вместо обычных ', либо проблемы с экранированием.

### Полная замена функции (самый чистый вариант)

Замените всю функцию sqliteCompat в файле server/src/db.ts на этот код:

```ts
// server/src/db.ts
export function sqliteCompat(sql: string): string {
  if (!sql || typeof sql !== 'string') return sql;

  let query = sql.trim();

  console.log('[sqliteCompat] BEFORE:', query); // для отладки

  // 1. Заменяем CURRENT_TIMESTAMP - INTERVAL 'N' UNIT
  query = query.replace(
    /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*['"]?(\d+)['"]?\s*(HOUR|HOURS|MINUTE|MINUTES|DAY|DAYS|SECOND|SECONDS)/gi,
    (_, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${num} ${u}s')`;
    }
  );

  // 2. Заменяем datetime('now') - INTERVAL 'N' UNIT
  query = query.replace(
    /datetime\(['"]now['"]\)\s*-\s*INTERVAL\s*['"]?(\d+)['"]?\s*(HOUR|HOURS|MINUTE|MINUTES|DAY|DAYS|SECOND|SECONDS)/gi,
    (_, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${num} ${u}s')`;
    }
  );

  // 3. Простая замена CURRENT_TIMESTAMP
  query = query.replace(/\bCURRENT_TIMESTAMP\b/gi, "datetime('now')");

  // 4. Удаляем оставшиеся INTERVAL (защита)
  query = query.replace(/INTERVAL\s*['"]?\d+['"]?\s*\w+/gi, '');

  console.log('[sqliteCompat] AFTER :', query);

  return query;
}
```

### Что делать дальше:

1. **Заменить функцию полностью** (скопируйте код выше).
2. **Перекомпилировать:**
   ```bash
   cd server
   npx tsc
   ```
3. **Перезапустить сервис:**
   ```bash
   kill <PID>
   cd /home/admingimolost/smart-estate/server && node dist/index.js &
   ```
4. **Проверить:**
   ```bash
   curl -v http://localhost:8788/api/status
   curl -v http://localhost:8788/api/dashboard
   ```
   Посмотрите логи сервера — там должны появиться строки `[sqliteCompat] BEFORE:` и `AFTER:`.

### Если после этого всё равно ошибка — пришлите:

- Полный текст ошибки
- Строки логов с `[sqliteCompat]`
- Код запроса, который падает (из api.ts)

---

Это решение использует максимально простой и устойчивый regex с `['"]?` (разрешает одинарные и двойные кавычки).  
Удачи! Напишите результат после применения.

# ФИНАЛЬНОЕ ИСПРАВЛЕНИЕ Dashboard (v2)

Текущая ошибка: `near "FROM": syntax error` — значит, после замены INTERVAL остался "мусор" в запросе (поломалась структура SQL, особенно JOIN или SELECT ... FROM).

---

### Шаг 1: Обновить sqliteCompat() (самая устойчивая версия)

Замените функцию в `server/src/db.ts` на эту:

```ts
export function sqliteCompat(sql: string): string {
  if (!sql || typeof sql !== 'string') return sql;

  let query = sql.trim();

  console.log('[sqliteCompat] BEFORE:', query);

  // 1. CURRENT_TIMESTAMP - INTERVAL 'N' UNIT (длинные варианты сначала!)
  query = query.replace(
    /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*['"]?(\d+)['"]?\s*(HOURS?|MINUTES?|DAYS?|SECONDS?)/gi,
    (_, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${num} ${u}s')`;
    }
  );

  // 2. datetime('now') - INTERVAL ...
  query = query.replace(
    /datetime\s*\(\s*['"]now['"]\s*\)\s*-\s*INTERVAL\s*['"]?(\d+)['"]?\s*(HOURS?|MINUTES?|DAYS?|SECONDS?)/gi,
    (_, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${num} ${u}s')`;
    }
  );

  // 3. Просто CURRENT_TIMESTAMP
  query = query.replace(/\bCURRENT_TIMESTAMP\b/gi, "datetime('now')");

  // 4. Удаляем остатки INTERVAL
  query = query.replace(/-\s*INTERVAL\s*['"]?\d+['"]?\s*\w+/gi, '');

  console.log('[sqliteCompat] AFTER :', query);

  return query;
}
```

---

### Шаг 2: Найти и починить запрос в api.ts

Откройте `server/src/api.ts` и найдите роут `/api/dashboard`.

Самое частое проблемное место:
```sql
... WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL 'X hours' ...
```

Убедитесь, что после применения `sqliteCompat(sql)` запрос выглядит чисто.

**Временный хак для отладки** (добавьте в начало роута `/api/dashboard`):
```ts
const rawSql = `... ваш оригинальный запрос ...`;
const fixedSql = sqliteCompat(rawSql);
console.log('[DASHBOARD SQL]:', fixedSql);
const result = db.prepare(fixedSql).all();
```

---

### Шаг 3: Действия

1. **Заменить функцию** `sqliteCompat()`.
2. **Перекомпилировать:**
   ```bash
   cd server && npx tsc
   ```
3. **Перезапустить:**
   ```bash
   cd /home/admingimolost/smart-estate
   kill $(lsof -ti:8788)
   cd server && node dist/index.js &
   ```
4. **Проверить:**
   ```bash
   curl http://localhost:8788/api/dashboard
   ```

---

### После применения пришлите:

- Логи `[sqliteCompat] BEFORE / AFTER`
- Полный текст ошибки `/api/dashboard` (если осталась)
- Сам SQL-запрос из роута dashboard (если возможно)

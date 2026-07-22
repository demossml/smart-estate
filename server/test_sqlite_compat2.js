// Проблема: CURRENT_TIMESTAMP -> datetime('now') срабатывает раньше,
// чем CURRENT_TIMESTAMP - INTERVAL -> datetime('now', '-N units')
// Решение: заменить CURRENT_TIMESTAMP на плейсхолдер, потом INTERVAL, потом плейсхолдер -> datetime('now')

const tests = [
  "SELECT COUNT(*) as cnt FROM errors WHERE ts >= CURRENT_TIMESTAMP - INTERVAL '24 hours'",
  "WHERE t.property = 'contact' AND t.value > 0 AND t.ts >= CURRENT_TIMESTAMP - INTERVAL '1 minute'",
  "WHERE property = 'temperature' AND device_ieee IN ( SELECT ieee_addr FROM devices WHERE room_id = ? ) AND ts >= CURRENT_TIMESTAMP - INTERVAL '1 hour'",
  "AND t.property = 'state' AND t.value > 0 AND t.ts >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'",
  "WHERE property = 'power' AND ts >= CURRENT_TIMESTAMP - INTERVAL '24 hours'",
  "WITH ts >= datetime('now') - INTERVAL '24' HOUR",  // после первой замены CURRENT_TIMESTAMP
  "AND ts >= CURRENT_TIMESTAMP - INTERVAL '1 minute'", // классика из api.ts
];

// Текущая реализация (order 1→3 ломает)
function sqliteCompat_old(sql) {
  if (!sql) return sql;
  let query = sql;
  
  // 1. CURRENT_TIMESTAMP - INTERVAL 'N' UNIT
  query = query.replace(
    /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s+'(\d+)'\s*(HOURS?|MINUTES?|DAYS?|SECONDS?)/gi,
    (_match, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${num} ${u}s')`;
    }
  );

  // 2. datetime('now') - INTERVAL 'N' UNIT
  query = query.replace(
    /datetime\('now'\)\s*-\s*INTERVAL\s+'(\d+)'\s*(HOURS?|MINUTES?|DAYS?|SECONDS?)/gi,
    (_match, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${num} ${u}s')`;
    }
  );

  // 3. CURRENT_TIMESTAMP → datetime('now') — СЛОМАНО: срабатывает раньше шага 1
  query = query.replace(/\bCURRENT_TIMESTAMP\b/gi, "datetime('now')");

  // 4. Удалить оставшиеся INTERVAL
  query = query.replace(/INTERVAL\s+'\d+'\s*\w+/gi, '');
  query = query.replace(/INTERVAL\s+\d+\s+\w+/gi, '');

  return query;
}

// Исправление: сначала плейсхолдер, потом INTERVAL, потом перевод
function sqliteCompat_new(sql) {
  if (!sql) return sql;
  let query = sql;
  
  // ШАГ 0: CURRENT_TIMESTAMP → плейсхолдер (чтобы замена INTERVAL ниже видела его И исчезла оригинальная фраза)
  // НЕТ — проще: сначала заменить CURRENT_TIMESTAMP - INTERVAL как единое целое.
  // Потом одиночные CURRENT_TIMESTAMP → datetime('now').
  // Потом одиночные datetime('now') - INTERVAL.
  
  // 1. CURRENT_TIMESTAMP - INTERVAL 'N' UNIT → datetime('now', '-N units')
  query = query.replace(
    /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s+'(\d+)'\s*(HOURS?|MINUTES?|DAYS?|SECONDS?)/gi,
    (_match, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${num} ${u}s')`;
    }
  );

  // 2. Одиночные CURRENT_TIMESTAMP → datetime('now') 
  query = query.replace(/\bCURRENT_TIMESTAMP\b/gi, "datetime('now')");

  // 3. datetime('now') - INTERVAL 'N' UNIT (для тех что уже прошли шаг 2 и не прошли шаг 1)
  query = query.replace(
    /datetime\('now'\)\s*-\s*INTERVAL\s+'(\d+)'\s*(HOURS?|MINUTES?|DAYS?|SECONDS?)/gi,
    (_match, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${num} ${u}s')`;
    }
  );

  // 4. Дополнительная защита
  query = query.replace(/INTERVAL\s+'\d+'\s*\w+/gi, '');
  query = query.replace(/INTERVAL\s+\d+\s+\w+/gi, '');

  return query;
}

console.log("=== OLD (broken) ===\n");
for (const t of tests) {
  const out = sqliteCompat_old(t);
  const pass = !out.includes('INTERVAL');
  console.log(`${pass ? 'OK' : 'FAIL'}: ${out}`);
}

console.log("\n=== NEW (fixed) ===\n");
for (const t of tests) {
  const out = sqliteCompat_new(t);
  const pass = !out.includes('INTERVAL');
  console.log(`${pass ? 'OK' : 'FAIL'}: ${out}`);
}

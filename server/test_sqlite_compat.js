// Тест sqliteCompat
function sqliteCompat(sql) {
  if (!sql) return sql;

  let query = sql;

  // 1. CURRENT_TIMESTAMP - INTERVAL 'N' UNIT
  query = query.replace(
    /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s+'?(\d+)'?\s*(HOUR|HOURS|MINUTE|MINUTES|DAY|DAYS|SECOND|SECONDS)/gi,
    (_match, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${num} ${u}s')`;
    }
  );

  // 2. datetime('now') - INTERVAL 'N' UNIT (второй проход)
  query = query.replace(
    /datetime\('now'\)\s*-\s*INTERVAL\s+'?(\d+)'?\s*(HOUR|HOURS|MINUTE|MINUTES|DAY|DAYS|SECOND|SECONDS)/gi,
    (_match, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${num} ${u}s')`;
    }
  );

  // 3. Просто CURRENT_TIMESTAMP → datetime('now')
  query = query.replace(/\bCURRENT_TIMESTAMP\b/gi, "datetime('now')");

  // 4. Дополнительная защита — удалить оставшиеся INTERVAL
  query = query.replace(/INTERVAL\s+'\d+'\s*\w+/gi, '');
  query = query.replace(/INTERVAL\s+\d+\s+\w+/gi, '');

  return query;
}

const tests = [
  "AND ts >= CURRENT_TIMESTAMP - INTERVAL '1 minute'",
  "AND ts >= CURRENT_TIMESTAMP - INTERVAL '24 hours'",
  "SELECT COUNT(*) FROM errors WHERE ts >= CURRENT_TIMESTAMP - INTERVAL '24 hours'",
  "WHERE ts >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'",
  "AND ts >= CURRENT_TIMESTAMP - INTERVAL '1 hour'",
  "WHERE ts >= datetime('now') - INTERVAL '24' HOUR",
];

console.log('=== sqliteCompat TESTS ===\n');
for (const t of tests) {
  const out = sqliteCompat(t);
  const pass = !out.includes('INTERVAL');
  console.log(`${pass ? '✅' : '❌'} IN:  ${t}`);
  console.log(`   OUT: ${out}\n`);
}

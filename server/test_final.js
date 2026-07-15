// ФИНАЛЬНЫЙ тест sqliteCompat — после ручного ввода кавычек
function sqliteCompat(sql) {
  if (!sql || typeof sql !== 'string') return sql;
  let query = sql.trim();

  // 1. CURRENT_TIMESTAMP - INTERVAL 'N' UNIT
  query = query.replace(
    /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*['"]?(\d+)['"]?\s*(HOUR|HOURS|MINUTE|MINUTES|DAY|DAYS|SECOND|SECONDS)/gi,
    (_match, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${num} ${u}s')`;
    }
  );

  // 2. datetime('now') - INTERVAL 'N' UNIT
  query = query.replace(
    /datetime\(['"]now['"]\)\s*-\s*INTERVAL\s*['"]?(\d+)['"]?\s*(HOUR|HOURS|MINUTE|MINUTES|DAY|DAYS|SECOND|SECONDS)/gi,
    (_match, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${num} ${u}s')`;
    }
  );

  // 3. CURRENT_TIMESTAMP standalone
  query = query.replace(/\bCURRENT_TIMESTAMP\b/gi, "datetime('now')");

  // 4. Remove leftover INTERVAL
  query = query.replace(/INTERVAL\s*['"]?\d+['"]?\s*\w+/gi, '');

  // 5. CURRENT_DATE
  query = query.replace(/\bCURRENT_DATE\b/gi, "date('now')");
  // 6. NOW()
  query = query.replace(/\bNOW\(\)/gi, "datetime('now')");
  // 7. ::DECIMAL(N,N)
  query = query.replace(/::DECIMAL\([^)]+\)/gi, '');
  // 8. ::VARCHAR
  query = query.replace(/::VARCHAR/gi, '');

  return query;
}

const tests = [
  "SELECT COUNT(*) as cnt FROM errors WHERE ts >= CURRENT_TIMESTAMP - INTERVAL '24 hours'",
  "WHERE t.property = 'contact' AND t.value > 0 AND t.ts >= CURRENT_TIMESTAMP - INTERVAL '1 minute'",
  "AND ts >= CURRENT_TIMESTAMP - INTERVAL '1 hour'",
  "AND t.ts >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'",
  "WHERE property = 'power' AND ts >= CURRENT_TIMESTAMP - INTERVAL '24 hours'",
  "AND ts >= datetime('now') - INTERVAL '24' HOUR",
  "CURRENT_DATE",
  "NOW()",
  "AVG(value)::DECIMAL(4,1)",
  // Особо сложный случай: без кавычек
  "WHERE ts >= NOW() - INTERVAL 24 HOURS",
];

let allOk = true;
for (const t of tests) {
  const out = sqliteCompat(t);
  const hasInterval = out.includes('INTERVAL');
  const hasCast = out.includes('::DECIMAL') || out.includes('::VARCHAR');
  const hasNowFn = out.includes('NOW()');
  const hasCurrentDate = out.includes('CURRENT_DATE');
  const hasCurrentTs = out.includes('CURRENT_TIMESTAMP') && !out.includes("datetime('now')");

  const fail = hasInterval || hasCast || hasNowFn || hasCurrentDate || hasCurrentTs;
  if (fail) {
    console.log(`❌ FAIL: ${t}`);
    console.log(`   OUT: ${out}`);
    allOk = false;
  } else {
    console.log(`✅ OK: ${out}`);
  }
}
console.log(`\n${allOk ? '🎉 ALL PASS' : '❌ SOME FAILED'}`);

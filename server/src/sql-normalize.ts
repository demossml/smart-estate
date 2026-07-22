// ── SQL Normalization Layer ──
// Преобразует не-SQLite синтаксис (INTERVAL, ::DECIMAL, EXTRACT, NOW())
// в нативный SQLite-синтаксис.

export function normalizeSql(sql: string): string {
  if (!sql || typeof sql !== 'string') return sql;

  let queryStr = sql.trim();

  // CURRENT_TIMESTAMP - INTERVAL 'N UNIT'
  queryStr = queryStr.replace(
    /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*['"](\\d+)\s+(hours?|minutes?|seconds?|days?|weeks?)['"]/gi,
    (_match, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${num} ${u}s')`;
    }
  );
  // NOW() - INTERVAL 'N UNIT'
  queryStr = queryStr.replace(
    /NOW\(\)\s*-\s*INTERVAL\s*['"](\\d+)\s+(hours?|minutes?|seconds?|days?|weeks?)['"]/gi,
    (_match, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${num} ${u}s')`;
    }
  );
  queryStr = queryStr.replace(/\bNOW\(\)/gi, "datetime('now')");
  queryStr = queryStr.replace(
    /INTERVAL\s+(\d+)\s+(HOURS?|MINUTES?|DAYS?|SECONDS?|WEEKS?)/gi,
    (_match, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `'-${num} ${u}s'`;
    }
  );
  queryStr = queryStr.replace(
    /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*['"]?(\d+)['"]?\s*(HOURS|HOUR|MINUTES|MINUTE|DAYS|DAY|SECONDS|SECOND)/gi,
    (_match, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${num} ${u}s')`;
    }
  );
  queryStr = queryStr.replace(
    /datetime\(['"]now['"]\)\s*-\s*INTERVAL\s*['"]?(\d+)['"]?\s*(HOURS|HOUR|MINUTES|MINUTE|DAYS|DAY|SECONDS|SECOND)/gi,
    (_match, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      return `datetime('now', '-${num} ${u}s')`;
    }
  );
  queryStr = queryStr.replace(/\bCURRENT_TIMESTAMP\b/gi, "datetime('now')");

  if (/INTERVAL/i.test(queryStr)) {
    throw new Error(`normalizeSql: необработанный INTERVAL-синтаксис в запросе: ${queryStr}`);
  }

  // EXTRACT(HOUR FROM ts) → CAST(strftime('%H', ts) AS INTEGER)
  queryStr = queryStr.replace(
    /EXTRACT\s*\(\s*(\w+)\s+FROM\s+(\w+(?:\.\w+)?)\s*\)/gi,
    (_match, field, col) => {
      const f = field.toUpperCase();
      const fmt = f === 'HOUR' ? '%H'
                  : f === 'MINUTE' ? '%M'
                  : f === 'DAY' ? '%d'
                  : f === 'MONTH' ? '%m'
                  : f === 'YEAR' ? '%Y'
                  : f === 'DOW' ? '%w'
                  : f === 'DOY' ? '%j'
                  : '%Y-%m-%d';
      return `CAST(strftime('${fmt}', ${col}) AS INTEGER)`;
    }
  );

  // ::DECIMAL(N,N), ::VARCHAR
  queryStr = queryStr.replace(/\bCURRENT_DATE\b/gi, "date('now')");
  queryStr = queryStr.replace(/::DECIMAL\([^)]+\)/gi, '');
  queryStr = queryStr.replace(/::VARCHAR/gi, '');

  return queryStr;
}

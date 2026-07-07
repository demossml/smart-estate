// Тест точного поведения sqliteCompat
const BetterSqlite3 = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.SMART_ESTATE_DB_PATH || path.resolve(__dirname, '../data/smart-estate.db');
const db = new BetterSqlite3(DB_PATH);

// Копирую sqliteCompat прямо сюда
function sqliteCompat(sql) {
  if (!sql || typeof sql !== 'string') return sql;
  let query = sql.trim();
  
  console.log('BEFORE:', JSON.stringify(query));
  
  // 1
  query = query.replace(
    /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*['"]?(\d+)['"]?\s*(HOUR|HOURS|MINUTE|MINUTES|DAY|DAYS|SECOND|SECONDS)/gi,
    (_match, num, unit) => {
      const u = unit.toLowerCase().replace(/s$/, '');
      const result = `datetime('now', '-${num} ${u}s')`;
      console.log('  MATCH1:', JSON.stringify(_match), '→', JSON.stringify(result));
      return result;
    }
  );
  
  // 3
  query = query.replace(/\bCURRENT_TIMESTAMP\b/gi, "datetime('now')");
  
  // 4
  query = query.replace(/INTERVAL\s*['"]?\d+['"]?\s*\w+/gi, '');
  
  console.log('AFTER:', JSON.stringify(query));
  return query;
}

const sql = "SELECT COUNT(*) as cnt FROM errors WHERE ts >= CURRENT_TIMESTAMP - INTERVAL '24 hours'";
const result = sqliteCompat(sql);
console.log('\nFINAL:', result);

// Теперь пробуем выполнить
db.pragma('journal_mode = WAL');
try {
  const rows = db.prepare(result).all();
  console.log('Rows:', rows);
} catch (e) {
  console.error('SQLite error:', e.message);
  console.log('Problematic SQL:', result);
  console.log('Char codes:', [...result].map(c => c.charCodeAt(0)).join(' '));
}

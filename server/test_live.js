// Отладка: запускаем сервер с выводом sqliteCompat BEFORE/AFTER в stderr
const BetterSqlite3 = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.SMART_ESTATE_DB_PATH || path.resolve(__dirname, '../data/smart-estate.db');
const db = new BetterSqlite3(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -8000');
db.pragma('foreign_keys = ON');

// Инициализируем схему
require('./dist/db');

// Эмулируем запрос /api/status
const sql = "SELECT COUNT(*) as cnt FROM devices";
console.log("SQL:", sql);

// Получаем sqliteCompat из db.js
const { query } = require('./dist/db');

query(sql).then(r => console.log("Result:", r)).catch(e => console.error("Error:", e.message));

// Теперь /api/status запрос с INTERVAL
const sql2 = "SELECT COUNT(*) as cnt FROM errors WHERE ts >= CURRENT_TIMESTAMP - INTERVAL '24 hours'";
console.log("\nSQL2:", sql2);
query(sql2).then(r => console.log("Result2:", r)).catch(e => {
  console.error("Error2:", e.message);
  // Выводим исходный SQL без transforms
  console.log("RAW SQL:", sql2);
});

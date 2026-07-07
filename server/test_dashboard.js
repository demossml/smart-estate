// Диагностика: что видит sqliteCompat для dashboard-запросов
const { sqliteCompat } = require('./dist/db.js');

const queries = [
  // Из /api/dashboard
  "SELECT t.device_ieee, d.friendly_name FROM telemetry t JOIN devices d ON t.device_ieee = d.ieee_addr WHERE t.property = 'contact' AND t.value > 0 AND t.ts >= CURRENT_TIMESTAMP - INTERVAL '1 minute'",
  "SELECT AVG(value)::DECIMAL(4,1) as temp FROM telemetry WHERE property = 'temperature' AND device_ieee IN ( SELECT ieee_addr FROM devices WHERE room_id = ? ) AND ts >= CURRENT_TIMESTAMP - INTERVAL '1 hour'",
  "SELECT d.ieee_addr FROM devices d JOIN telemetry t ON d.ieee_addr = t.device_ieee WHERE d.room_id = ? AND d.type = 'light' AND t.property = 'state' AND t.value > 0 AND t.ts >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'",
  "SELECT AVG(value)::DECIMAL(4,1) as val, EXTRACT(HOUR FROM ts) as h FROM telemetry WHERE property = 'power' AND ts >= CURRENT_TIMESTAMP - INTERVAL '24 hours'",
];

for (const q of queries) {
  const out = sqliteCompat(q);
  const hasInterval = out.includes('INTERVAL');
  const hasDuckDB = out.includes('::DECIMAL');
  console.log(`${hasInterval ? '❌' : hasDuckDB ? '❌' : '✅'} ${out.substring(0, 120)}`);
  if (hasInterval) console.log(`   PROBLEM: INTERVAL found at pos ${out.indexOf('INTERVAL')}`);
  if (hasDuckDB) console.log(`   PROBLEM: ::DECIMAL found at pos ${out.indexOf('::DECIMAL')}`);
}

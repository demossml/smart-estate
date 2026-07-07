// Проблема: не захватывается полное hours
const sql = "CURRENT_TIMESTAMP - INTERVAL '24 hours'";

// Test 1: исходный regex из dist
const r1 = /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*['"]?(\d+)['"]?\s*(HOURS?)/gi;
const m1 = r1.exec(sql);
console.log('Test 1 (HOURS?):');
console.log('  match:', JSON.stringify(m1));
console.log('  groups:', m1 ? m1[1] + ', ' + m1[2] : 'none');

// Test 2: с HOURS (без ?)
const r2 = /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*['"]?(\d+)['"]?\s*(HOURS)/gi;
const m2 = r2.exec(sql);
console.log('Test 2 (HOURS):');
console.log('  match:', JSON.stringify(m2));
console.log('  groups:', m2 ? m2[1] + ', ' + m2[2] : 'none');

// Test 3: HOURS|HOUR — сначала длинное
const r3 = /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*['"]?(\d+)['"]?\s*(HOURS|HOUR)/gi;
const m3 = r3.exec(sql);
console.log('Test 3 (HOURS|HOUR):');
console.log('  match:', JSON.stringify(m3));
console.log('  groups:', m3 ? m3[1] + ', ' + m3[2] : 'none');

// Test 4: какая разница между '24 hour' и '24 hours'?
console.log('\n--- Разбор посимвольно ---');
const match = /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*['"]?(\d+)['"]?\s*(HOUR)/gi.exec(sql);
console.log('HOUR only:', JSON.stringify(match));
const match2 = /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*['"]?(\d+)['"]?\s*(HOURS)/gi.exec(sql);
console.log('HOURS only:', JSON.stringify(match2));

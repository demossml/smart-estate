// Ключевой тест: почему в одном случае работает, а в другом нет?
// Разница может быть в том, как я вставляю regex в patch

// Версия как в dist (TypeScript -> JS компиляция)
const r_dist = new RegExp("CURRENT_TIMESTAMP\\s*-\\s*INTERVAL\\s*['\"]?(\\d+)['\"]?\\s*(HOURS?)", "gi");
const sql = "CURRENT_TIMESTAMP - INTERVAL '24 hours'";
const m = r_dist.exec(sql);
console.log('Dist regex match:', JSON.stringify(m));
console.log('Groups:', m ? `${m[1]} | ${m[2]}` : 'none');

// Версия с (HOUR|HOURS|MINUTE|...) как в db.ts
const r_full = /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s*['"]?(\d+)['"]?\s*(HOUR|HOURS|MINUTE|MINUTES|DAY|DAYS|SECOND|SECONDS)/gi;
const m2 = r_full.exec(sql);
console.log('Full regex match:', JSON.stringify(m2));
console.log('Groups:', m2 ? `${m2[1]} | ${m2[2]}` : 'none');

// А если посмотреть на то, как matchAll видит?
const all1 = [...sql.matchAll(r_dist)];
console.log('\nmatchAll dist:', all1.map(a => a[0] + ' → ' + a[2]));
const all2 = [...sql.matchAll(r_full)];
console.log('matchAll full:', all2.map(a => a[0] + ' → ' + a[2]));

// Ключевой вопрос: если несколько вариантов в группе (HOUR|HOURS), 
// какой будет выбран для hours?
const r_ordered = /(HOURS|HOUR)/i;
console.log('\nOrdered test:', r_ordered.exec('hours'));
console.log('Ordered test2:', r_ordered.exec('hour'));

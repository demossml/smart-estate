// Диагностика: почему не совпадает regex

const sql = "SELECT COUNT(*) as cnt FROM errors WHERE ts >= CURRENT_TIMESTAMP - INTERVAL '24 hours'";

const r1 = /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s+'(\d+)'\s*(HOURS?|MINUTES?|DAYS?|SECONDS?)/gi;
const arr = [...sql.matchAll(r1)];
console.log('Matches:', arr.length, JSON.stringify(arr));

// Попробуем отдельно две части
const r_part = /CURRENT_TIMESTAMP/gi;
console.log('CT matches:', sql.match(r_part));

const r_int = /INTERVAL\s+'(\d+)'\s*(HOURS?|MINUTES?|DAYS?|SECONDS?)/gi;
console.log('INTERVAL matches:', [...sql.matchAll(r_int)]);

// Может быть, '24 hours' не совпадает из-за заглавных?
const r_test = /INTERVAL\s+'(\d+)'\s*(HOURS?|MINUTES?|DAYS?|SECONDS?)/gi;
console.log('Exact test:', r_test.exec("INTERVAL '24 hours'"));
console.log('With GI:', "INTERVAL '24 hours'".match(r_test));

// А может быть строчные 'hours'?
console.log('Lowercase test:', /INTERVAL\s+'(\d+)'\s*(hours?|minutes?|days?|seconds?)/gi.exec("INTERVAL '24 hours'"));

// Проверка regex в чистом виде
const r = /INTERVAL\s+'(\d+)'\s*(HOURS?|MINUTES?|DAYS?|SECONDS?)/gi;
const str = "INTERVAL '24 hours'";
console.log('Input:', str);
console.log('Match:', r.exec(str));
console.log('All matches:', [...str.matchAll(r)]);

// По частям
const r2 = /INTERVAL\s+'\d+'\s*\w+/gi;
console.log('Simple INTERVAL:', r2.exec(str));

// Без \s+ между числом и единицей
const r3 = /INTERVAL\s+'(\d+)'\s*(\w+)/gi;
console.log('Simple word:', r3.exec(str));

// Может быть '24 hours' не совпадает из-за пробела?
const r4 = /INTERVAL\s+'24'\s*(HOURS?)/gi;
console.log('Literal 24:', r4.exec("INTERVAL '24'"));

// А может быть проблема с тем что hours в input строчные?
const r5 = /INTERVAL\s+'(\d+)'\s*(HOURS?)/gi;
console.log('HOURS insensitive:', r5.exec("INTERVAL '24 hours'"));

// Может быть из-за exec vs match?
const r6 = new RegExp("INTERVAL\\s+'(\\d+)'\\s*(HOURS?|MINUTES?|DAYS?|SECONDS?)", "gi");
console.log('With new RegExp:', r6.exec("INTERVAL '24 hours'"));

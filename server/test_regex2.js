const str = "INTERVAL '24 hours'";
console.log('Characters:', [...str].map(c => c.charCodeAt(0).toString(16) + ':' + c).join(' '));

// Пробуем разные кавычки
console.log('With single quote:', /INTERVAL\s+'/.test(str));
console.log('With right quote:', /INTERVAL\s+['\u2019]/.test(str));
console.log('Any quote:', /INTERVAL\s+['\u2018\u2019]/.test(str));

// Попробуем через includes
console.log('Has APOSTROPHE:', str.includes("'"));
console.log('Has RIGHT SINGLE:', str.includes('\u2019'));
console.log('Char after space:', str.charCodeAt(9).toString(16));

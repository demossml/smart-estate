const sql = "CURRENT_TIMESTAMP - INTERVAL '24 hours'";
console.log("SQL bytes:", Buffer.from(sql).toString("hex"));

// Вытаскиваю каждый символ из строки sql
for (let i = 0; i < sql.length; i++) {
  console.log(i, sql[i], sql.charCodeAt(i));
}

// Вытаскиваю из regex source
const r = /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s+'(\d+)'\s*(HOURS?)/i;
console.log("Regex source bytes:", Buffer.from(r.source).toString("hex"));
console.log("Regex source:", r.source);

// Смотрю что внутри
const source = r.source;
for (let i = 0; i < source.length; i++) {
  console.log(i, source[i], source.charCodeAt(i));
}

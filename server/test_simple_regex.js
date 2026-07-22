const sql = "CURRENT_TIMESTAMP - INTERVAL '24 hours'";
const r = /CURRENT_TIMESTAMP\s*-\s*INTERVAL\s+'(\d+)'\s*(HOURS?)/i;
console.log("Test:", r.exec(sql));
console.log("Regex source:", r.source);
console.log("Test matches:", sql.match(r));

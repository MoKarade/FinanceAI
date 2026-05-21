// Construit public/test-portfolio-history.csv à partir des JSON Yahoo Finance
// téléchargés dans /tmp/yh_*.json. No-fake : si une série manque, on rapporte
// l'erreur et on n'invente rien.
const fs = require("fs");
const path = require("path");

const SYMBOLS = ["VFV.TO", "AAPL", "BTC-CAD", "VEQT.TO", "XEQT.TO"];
const TMP_DIR = process.env.TEMP_DIR || "C:\\Users\\dessin14\\AppData\\Local\\Temp";

function safeName(sym) {
  return sym.replace(/\./g, "_").replace(/-/g, "_");
}

const data = {};
const currencies = {};

for (const sym of SYMBOLS) {
  const file = path.join(TMP_DIR, `yh_${safeName(sym)}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Manquant: ${file}`);
  }
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const res = j.chart.result[0];
  const meta = res.meta;
  currencies[sym] = meta.currency;
  const ts = res.timestamp;
  const closes = res.indicators.quote[0].close;
  const series = {};
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c == null) continue;
    const d = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    series[d] = Math.round(c * 10000) / 10000;
  }
  data[sym] = series;
  const keys = Object.keys(series);
  console.log(
    `${sym}: currency=${currencies[sym]}, points=${keys.length}, first=${keys[0]}, last=${keys[keys.length - 1]}`,
  );
}

// Union triée des dates
const allDates = new Set();
for (const s of SYMBOLS) for (const d of Object.keys(data[s])) allDates.add(d);
const sortedDates = [...allDates].sort();
console.log(`\nDates uniques totales: ${sortedDates.length}`);

// Écriture CSV
const outPath = path.resolve(__dirname, "..", "public", "test-portfolio-history.csv");
const rows = [["date", ...SYMBOLS].join(",")];
for (const d of sortedDates) {
  const row = [d, ...SYMBOLS.map((s) => (data[s][d] != null ? String(data[s][d]) : ""))];
  rows.push(row.join(","));
}
fs.writeFileSync(outPath, rows.join("\n") + "\n", "utf8");
console.log(`\nÉcrit: ${outPath}`);
console.log(`Devises:`, currencies);

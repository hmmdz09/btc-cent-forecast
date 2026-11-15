// Fetch a long history of BTC 1-minute closes so the estimator choice is validated on
// thousands of independent 4-hour blocks instead of one 4-day practice window.
// Build-time only: the entry itself runs offline.
import { writeFileSync } from 'node:fs';

const OUT = 'C:/Users/hamdi/makefun-btc/btc1m.json';
const sources = [
  { name: 'binance', url: (s, e) => `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&startTime=${s}&endTime=${e}&limit=1000` },
  { name: 'binance-us', url: (s, e) => `https://api.binance.us/api/v3/klines?symbol=BTCUSDT&interval=1m&startTime=${s}&endTime=${e}&limit=1000` },
];

const DAYS = Number(process.argv[2] ?? 60);
const end = Date.now();
const start = end - DAYS * 86400_000;

async function tryFetch(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'curl/8' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

let picked = null;
for (const s of sources) {
  try {
    const probe = await tryFetch(s.url(end - 3600_000, end));
    if (Array.isArray(probe) && probe.length) { picked = s; console.log(`source: ${s.name} (probe ${probe.length} bars)`); break; }
  } catch (e) { console.log(`${s.name} failed: ${String(e).slice(0, 160)}`); }
}
if (!picked) { console.log('NO SOURCE AVAILABLE'); process.exit(1); }

const bars = new Map(); // epoch minute -> close
let cursor = start;
let calls = 0;
while (cursor < end) {
  const chunkEnd = Math.min(end, cursor + 1000 * 60_000);
  let rows;
  try { rows = await tryFetch(picked.url(cursor, chunkEnd)); } catch (e) {
    console.log('chunk failed, retrying once:', String(e).slice(0, 120));
    await new Promise((r) => setTimeout(r, 1500));
    rows = await tryFetch(picked.url(cursor, chunkEnd));
  }
  calls++;
  if (!rows.length) break;
  for (const r of rows) bars.set(Math.floor(r[0] / 60000), Number(r[4]));
  cursor = rows[rows.length - 1][0] + 60_000;
  if (calls % 20 === 0) console.log(`  ${calls} calls, ${bars.size} bars, at ${new Date(cursor).toISOString()}`);
  await new Promise((r) => setTimeout(r, 120));
}

const minutes = [...bars.keys()].sort((a, b) => a - b);
const first = minutes[0], lastM = minutes[minutes.length - 1];
let gaps = 0;
const series = [];
for (let t = first; t <= lastM; t++) {
  if (!bars.has(t)) { gaps++; series.push(series[series.length - 1]); } // carry forward, as the recorder does
  else series.push(bars.get(t));
}
console.log(JSON.stringify({
  bars: bars.size, span: series.length, gaps_filled: gaps,
  from: new Date(first * 60000).toISOString(), to: new Date(lastM * 60000).toISOString(),
  min: Math.min(...series), max: Math.max(...series),
}, null, 2));
writeFileSync(OUT, JSON.stringify({ first, series }));
console.log('wrote', OUT);

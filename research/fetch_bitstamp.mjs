// Fetch BTC/USD 1-minute closes from Bitstamp (via the reachable r.jina.ai proxy) so the
// estimator choice is validated on hundreds of independent 4-hour blocks, not one window.
// Build-time research only: the submitted entry runs fully offline.
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

const OUT = 'C:/Users/hamdi/makefun-btc/btc1m.json';
const DAYS = Number(process.argv[2] ?? 120);
const STEP = 60;      // 1-minute bars
const LIMIT = 1000;   // Bitstamp max per call
const base = 'https://www.bitstamp.net/api/v2/ohlc/btcusd/';
const prox = (u) => `https://r.jina.ai/${u}`;

const nowSec = Math.floor(Date.now() / 1000);
const startSec = nowSec - DAYS * 86400;

async function getJson(url, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(prox(url), { headers: { 'user-agent': 'curl/8' } });
      const text = await res.text();
      // The proxy answers either a markdown preamble + raw body, or a JSON envelope
      // whose data.content holds the body. Pull the ohlc object out of whichever came.
      const marker = '{"data": {"pair"';
      let s = text.indexOf(marker);
      if (s < 0) s = text.indexOf('{"data":{"pair"');
      if (s < 0) {
        // JSON envelope: unwrap and look inside its content
        try {
          const env = JSON.parse(text);
          const inner = env?.data?.content ?? env?.content ?? '';
          const j = inner.indexOf('{"data"');
          if (j >= 0) return JSON.parse(inner.slice(j, inner.lastIndexOf('}') + 1));
        } catch { /* fall through to the error below */ }
        throw new Error(`no ohlc JSON in ${text.slice(0, 180).replace(/\s+/g, ' ')}`);
      }
      const e = text.lastIndexOf('}');
      if (e <= s) throw new Error('truncated JSON');
      return JSON.parse(text.slice(s, e + 1));
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
  throw lastErr;
}

const bars = existsSync(OUT) ? new Map(Object.entries(JSON.parse(readFileSync(OUT, 'utf8')).bars ?? {}).map(([k, v]) => [Number(k), v])) : new Map();
console.log(`resuming with ${bars.size} bars cached`);

let cursor = startSec;
let calls = 0, empty = 0;
while (cursor < nowSec) {
  const url = `${base}?step=${STEP}&limit=${LIMIT}&start=${cursor}`;
  let j;
  try { j = await getJson(url); } catch (e) { console.log('give up chunk:', String(e).slice(0, 120)); break; }
  const rows = j?.data?.ohlc ?? [];
  calls++;
  if (!rows.length) { empty++; if (empty > 2) break; cursor += LIMIT * STEP; continue; }
  empty = 0;
  for (const r of rows) bars.set(Math.floor(Number(r.timestamp) / 60), Number(r.close));
  const lastTs = Number(rows[rows.length - 1].timestamp);
  if (lastTs + STEP <= cursor) break;
  cursor = lastTs + STEP;
  if (calls % 10 === 0) {
    console.log(`  ${calls} calls, ${bars.size} bars, at ${new Date(cursor * 1000).toISOString()}`);
    writeFileSync(OUT, JSON.stringify({ bars: Object.fromEntries(bars) }));
  }
  await new Promise((r) => setTimeout(r, 250));
}

const minutes = [...bars.keys()].sort((a, b) => a - b);
const first = minutes[0], lastM = minutes[minutes.length - 1];
let filled = 0;
const series = [];
for (let t = first; t <= lastM; t++) {
  if (!bars.has(t)) { filled++; series.push(series[series.length - 1]); } else series.push(bars.get(t));
}
console.log(JSON.stringify({
  calls, bars: bars.size, span: series.length, carried_forward: filled,
  from: new Date(first * 60000).toISOString(), to: new Date(lastM * 60000).toISOString(),
  min: Math.min(...series), max: Math.max(...series),
}, null, 2));
writeFileSync(OUT, JSON.stringify({ first, series, bars: Object.fromEntries(bars) }));
console.log('wrote', OUT);

// Merge the kit's 6 practice cases into one continuous minute series, then backtest
// candidate 4h-ahead estimators against the persistence baseline on MAE in cents.
import { readFileSync, writeFileSync } from 'node:fs';

const KIT = 'C:/Users/hamdi/makefun-btc/kit/btc-cent-forecast-01-kit';
const ids = ['p00', 'p01', 'p02', 'p03', 'p04', 'p05'];

const byMinute = new Map(); // epoch minute -> price
for (const id of ids) {
  const c = JSON.parse(readFileSync(`${KIT}/input/${id}.in`, 'utf8'));
  const m = c.markets[0];
  const start = Date.parse(m.start) / 60000;
  m.prices.forEach((p, i) => byMinute.set(start + i, p));
}
const minutes = [...byMinute.keys()].sort((a, b) => a - b);
const first = minutes[0], last = minutes[minutes.length - 1];
// check continuity
let gaps = 0;
for (let t = first; t <= last; t++) if (!byMinute.has(t)) gaps++;
const series = [];
for (let t = first; t <= last; t++) series.push(byMinute.get(t));

console.log(JSON.stringify({
  minutes: minutes.length,
  span_minutes: last - first + 1,
  gaps,
  from: new Date(first * 60000).toISOString(),
  to: new Date(last * 60000).toISOString(),
  price_min: Math.min(...series),
  price_max: Math.max(...series),
  first_price: series[0],
  last_price: series[series.length - 1],
}, null, 2));

// how noisy is a single minute? distribution of |p[t] - median(p[t-9..t])|
const H = 240;
const absdiff = [];
for (let t = 10; t < series.length; t++) {
  const w = series.slice(t - 9, t + 1).slice().sort((a, b) => a - b);
  const med = w[Math.floor(w.length / 2)];
  absdiff.push(Math.abs(series[t] - med));
}
absdiff.sort((a, b) => a - b);
const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
console.log('spike size |last - median10| dollars: p50', q(absdiff, 0.5).toFixed(3),
  'p90', q(absdiff, 0.9).toFixed(3), 'p99', q(absdiff, 0.99).toFixed(3), 'max', absdiff[absdiff.length - 1].toFixed(3));

// 4h move distribution
const moves = [];
for (let t = 0; t + H < series.length; t++) moves.push(series[t + H] - series[t]);
const absMoves = moves.map(Math.abs).sort((a, b) => a - b);
console.log('4h abs move dollars: p50', q(absMoves, 0.5).toFixed(2), 'p90', q(absMoves, 0.9).toFixed(2), 'mean',
  (absMoves.reduce((a, b) => a + b, 0) / absMoves.length).toFixed(2));

writeFileSync('C:/Users/hamdi/makefun-btc/series.json', JSON.stringify({ first, series }));
console.log('wrote series.json');

// Out-of-sample validation on 45 days of real BTC 1-minute closes (Bitstamp).
// Question: does ANY estimator beat persistence on 4h-ahead MAE, consistently?
// Reported per-week so a window-specific trend cannot masquerade as an edge.
import { readFileSync } from 'node:fs';

const { series } = JSON.parse(readFileSync('C:/Users/hamdi/makefun-btc/btc1m.json', 'utf8'));
const H = 240, WARM = 4320;
console.log(`history: ${series.length} minutes (${(series.length / 1440).toFixed(1)} days)`);

// non-overlapping checkpoints every 60 min keeps the test large but far less correlated
const STRIDE = 60;
const idx = [];
for (let t = WARM - 1; t + H < series.length; t += STRIDE) idx.push(t);
console.log(`checkpoints: ${idx.length} (stride ${STRIDE} min)`);

const median = (a) => {
  const s = a.slice().sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const last = (h) => h[h.length - 1];

function errors(fn) {
  return idx.map((t) => Math.abs(fn(series.slice(0, t + 1)) - series[t + H]) * 100);
}

const baseErr = errors(last);
const base = mean(baseErr);
console.log(`\npersistence baseline MAE = ${base.toFixed(0)} cents ($${(base / 100).toFixed(2)})\n`);

const cands = {
  'median 3': (h) => median(h.slice(-3)),
  'median 5': (h) => median(h.slice(-5)),
  'median 9': (h) => median(h.slice(-9)),
  'median 15': (h) => median(h.slice(-15)),
  'median 31': (h) => median(h.slice(-31)),
  'mean 5': (h) => mean(h.slice(-5)),
  'mean 15': (h) => mean(h.slice(-15)),
  '0.5*last+0.5*med5': (h) => 0.5 * last(h) + 0.5 * median(h.slice(-5)),
  '0.75*last+0.25*med9': (h) => 0.75 * last(h) + 0.25 * median(h.slice(-9)),
  '0.9*last+0.1*med9': (h) => 0.9 * last(h) + 0.1 * median(h.slice(-9)),
  'med15 shrink10 -> med480': (h) => median(h.slice(-15)) * 0.9 + median(h.slice(-480)) * 0.1,
  'med15 shrink20 -> med480': (h) => median(h.slice(-15)) * 0.8 + median(h.slice(-480)) * 0.2,
  'med15 shrink30 -> med480': (h) => median(h.slice(-15)) * 0.7 + median(h.slice(-480)) * 0.3,
  'last shrink5 -> med1440': (h) => last(h) * 0.95 + median(h.slice(-1440)) * 0.05,
  'last shrink10 -> med1440': (h) => last(h) * 0.9 + median(h.slice(-1440)) * 0.1,
  'last - 0.1*move(240)': (h) => { const a = last(h); return a - 0.1 * (a - h[h.length - 241]); },
  'last + 0.1*move(240)': (h) => { const a = last(h); return a + 0.1 * (a - h[h.length - 241]); },
};

// weekly breakdown: 7 days = 10080 min
const weekOf = (t) => Math.floor((t - (WARM - 1)) / 10080);
const nWeeks = weekOf(idx[idx.length - 1]) + 1;

const rows = [];
for (const [name, fn] of Object.entries(cands)) {
  const e = errors(fn);
  const overall = (mean(e) - base) / base * 100;
  const weekly = [];
  for (let w = 0; w < nWeeks; w++) {
    const sel = idx.map((t, i) => [weekOf(t), i]).filter(([ww]) => ww === w).map(([, i]) => i);
    if (sel.length < 20) { weekly.push(NaN); continue; }
    const mine = mean(sel.map((i) => e[i])), theirs = mean(sel.map((i) => baseErr[i]));
    weekly.push((mine - theirs) / theirs * 100);
  }
  const valid = weekly.filter((v) => !Number.isNaN(v));
  rows.push({ name, overall, weekly, winWeeks: valid.filter((v) => v < 0).length, nw: valid.length });
}
rows.sort((a, b) => a.overall - b.overall);

console.log('estimator                      overall   weeks better   per-week % vs persistence');
for (const r of rows) {
  console.log(
    r.name.padEnd(28),
    `${r.overall >= 0 ? '+' : ''}${r.overall.toFixed(3)}%`.padStart(8),
    `${r.winWeeks}/${r.nw}`.padStart(10), '  ',
    r.weekly.map((v) => (Number.isNaN(v) ? '  n/a' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}`).padStart(6)).join(' '),
  );
}
console.log('\n(negative = better than persistence; an edge must be negative in MOST weeks)');

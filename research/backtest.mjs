// Backtest candidate estimators on the merged practice series.
// Score = mean absolute error in cents vs the actual close 240 min later.
// Baseline = persistence (raw last price), the house entry we must beat.
import { readFileSync } from 'node:fs';

const { series } = JSON.parse(readFileSync('C:/Users/hamdi/makefun-btc/series.json', 'utf8'));
const H = 240;
const WARM = 4320; // a real case gives 4320 minutes of history

// usable checkpoint indices: need WARM history behind and H ahead
const idx = [];
for (let t = WARM - 1; t + H < series.length; t++) idx.push(t);
console.log('backtest checkpoints:', idx.length);

const median = (a) => {
  const s = a.slice().sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

function mae(fn) {
  let sum = 0;
  for (const t of idx) {
    const hist = series.slice(0, t + 1); // prices up to and including checkpoint
    const guess = fn(hist);
    sum += Math.abs(guess - series[t + H]) * 100;
  }
  return sum / idx.length;
}

const last = (h) => h[h.length - 1];
const medK = (k) => (h) => median(h.slice(-k));
const meanK = (k) => (h) => h.slice(-k).reduce((a, b) => a + b, 0) / Math.min(k, h.length);

const results = [];
results.push(['persistence (raw last)', mae(last)]);
for (const k of [3, 5, 9, 15, 21, 31, 45, 61, 91, 121, 181, 241, 361, 481, 721]) {
  results.push([`median last ${k}`, mae(medK(k))]);
}
for (const k of [5, 15, 31, 61, 121, 241, 481]) {
  results.push([`mean last ${k}`, mae(meanK(k))]);
}

// shrink the median anchor toward a longer-run level (mean reversion)
for (const k of [15, 31, 61]) {
  for (const L of [480, 720, 1440, 2880]) {
    for (const w of [0.05, 0.1, 0.2, 0.3]) {
      results.push([`med${k} shrink ${Math.round(w * 100)}% to med${L}`, mae((h) => {
        const a = median(h.slice(-k));
        const b = median(h.slice(-L));
        return a * (1 - w) + b * w;
      })]);
    }
  }
}

// momentum: extrapolate a fraction of the last H move
for (const k of [31]) {
  for (const lb of [60, 120, 240, 480]) {
    for (const g of [-0.2, -0.1, -0.05, 0.05, 0.1, 0.2]) {
      results.push([`med${k} + ${g} * move(${lb})`, mae((h) => {
        const a = median(h.slice(-k));
        const prev = median(h.slice(-lb - k, -lb));
        return a + g * (a - prev);
      })]);
    }
  }
}

results.sort((a, b) => a[1] - b[1]);
const base = results.find((r) => r[0] === 'persistence (raw last)')[1];
console.log('\nbaseline (persistence) =', base.toFixed(6), 'cents\n');
console.log('rank  estimator                                   MAE(cents)   vs baseline');
results.slice(0, 30).forEach(([name, v], i) => {
  const d = ((v - base) / base * 100);
  console.log(String(i + 1).padStart(4), name.padEnd(42), v.toFixed(6).padStart(12), `  ${d >= 0 ? '+' : ''}${d.toFixed(3)}%`);
});
console.log('\n... persistence rank:', results.findIndex((r) => r[0] === 'persistence (raw last)') + 1, 'of', results.length);

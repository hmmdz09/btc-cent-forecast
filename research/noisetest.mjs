// The decisive test. Bitstamp closes are clean trade prices, so denoising buys nothing there.
// The competition's feed is an Orca pool MID, sampled every 2s, median-of-last-10s per bar:
// on the practice window |last - median(10)| was p50 $17.74, p90 $102, max $1623.
// So: inject microstructure noise with that measured profile into the clean 45-day series
// (both anchor and target, as the real feed has it) and ask whether denoising the anchor helps
// on a LARGE sample. This is how to size the gain honestly.
import { readFileSync } from 'node:fs';

const clean = JSON.parse(readFileSync('C:/Users/hamdi/makefun-btc/btc1m.json', 'utf8')).series;
const prac = JSON.parse(readFileSync('C:/Users/hamdi/makefun-btc/series.json', 'utf8')).series;
const H = 240, WARM = 4320;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const med = (a) => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

// --- measure the real feed's noise: deviation of each close from a local robust level
const dev = [];
for (let t = 5; t < prac.length - 5; t++) dev.push(prac[t] - med(prac.slice(t - 5, t + 6)));
const absdev = dev.map(Math.abs).sort((a, b) => a - b);
const q = (p) => absdev[Math.floor(absdev.length * p)];
console.log(`real-feed noise |close - local median|: p50 $${q(0.5).toFixed(2)} p90 $${q(0.9).toFixed(2)} p99 $${q(0.99).toFixed(2)}`);
// relative, so it scales to the clean series' price level
const relDev = [];
for (let t = 5; t < prac.length - 5; t++) {
  const m = med(prac.slice(t - 5, t + 6));
  relDev.push((prac[t] - m) / m);
}
console.log(`sampled from ${relDev.length} real deviations (bootstrapped, preserving fat tails)\n`);

let seed = 2026111501;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

function noisy(series) {
  // add a bootstrapped real deviation to every minute: an independent pool dislocation
  return series.map((p) => p * (1 + relDev[Math.floor(rnd() * relDev.length)]));
}

const median3 = (x, y, z) => x + y + z - Math.min(x, y, z) - Math.max(x, y, z);

const RUNS = 8;
const results = new Map();
const label = (a, k) => `a=${a.toFixed(1)} k=${k}`;
const configs = [];
for (const k of [1, 3, 5, 9]) for (const a of [0, 0.3, 0.5, 0.7, 1]) {
  if (k === 1 && a !== 1) continue;
  configs.push([a, k]);
}

for (let r = 0; r < RUNS; r++) {
  const s = noisy(clean);
  const idx = [];
  for (let t = WARM - 1; t + H < s.length; t += 15) idx.push(t);
  const baseErr = idx.map((t) => Math.abs(s[t] - s[t + H]) * 100);
  const base = mean(baseErr);
  for (const [a, k] of configs) {
    const e = idx.map((t) => {
      const w = s.slice(t - k + 1, t + 1);
      const m = k === 3 ? median3(w[2], w[1], w[0]) : med(w);
      const g = a * s[t] + (1 - a) * m;
      return Math.abs(g - s[t + H]) * 100;
    });
    const d = (mean(e) - base) / base * 100;
    if (!results.has(label(a, k))) results.set(label(a, k), []);
    results.get(label(a, k)).push(d);
  }
}

console.log(`=== ${RUNS} independent noise realisations, ~4000 checkpoints each ===`);
console.log('config         mean %      worst %     best %   runs better');
const rows = [...results.entries()].map(([name, ds]) => ({
  name, m: mean(ds), worst: Math.max(...ds), best: Math.min(...ds), wins: ds.filter((v) => v < 0).length, n: ds.length,
}));
rows.sort((a, b) => a.m - b.m);
for (const r of rows) {
  console.log(
    r.name.padEnd(14),
    `${r.m >= 0 ? '+' : ''}${r.m.toFixed(3)}`.padStart(8),
    `${r.worst >= 0 ? '+' : ''}${r.worst.toFixed(3)}`.padStart(11),
    `${r.best >= 0 ? '+' : ''}${r.best.toFixed(3)}`.padStart(10),
    `${r.wins}/${r.n}`.padStart(11),
  );
}
console.log('\n(a=1 k=1 IS persistence, the baseline: 0 by construction)');

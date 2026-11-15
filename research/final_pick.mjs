// Final parameter choice, on the noise-matched test only (the right laboratory).
// More realisations, finer grid, and a check that the pick sits on a FLAT optimum
// rather than a spike -- a flat optimum survives a feed that is noisier or calmer
// than the practice window happened to be.
import { readFileSync } from 'node:fs';

const clean = JSON.parse(readFileSync('C:/Users/hamdi/makefun-btc/btc1m.json', 'utf8')).series;
const prac = JSON.parse(readFileSync('C:/Users/hamdi/makefun-btc/series.json', 'utf8')).series;
const H = 240, WARM = 4320;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const med = (a) => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

const relDev = [];
for (let t = 5; t < prac.length - 5; t++) {
  const m = med(prac.slice(t - 5, t + 6));
  relDev.push((prac[t] - m) / m);
}

let seed = 777000111;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// scale lets us test a feed noisier (1.5x) or calmer (0.5x) than the practice window
function noisy(series, scale) {
  return series.map((p) => p * (1 + scale * relDev[Math.floor(rnd() * relDev.length)]));
}

const grid = [];
for (const k of [3, 5, 7]) for (const a of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) grid.push([a, k]);

for (const scale of [0.5, 1.0, 1.5]) {
  const acc = new Map();
  const RUNS = 6;
  for (let r = 0; r < RUNS; r++) {
    const s = noisy(clean, scale);
    const idx = [];
    for (let t = WARM - 1; t + H < s.length; t += 15) idx.push(t);
    const base = mean(idx.map((t) => Math.abs(s[t] - s[t + H]) * 100));
    for (const [a, k] of grid) {
      const e = mean(idx.map((t) => {
        const w = s.slice(t - k + 1, t + 1);
        return Math.abs((a * s[t] + (1 - a) * med(w)) - s[t + H]) * 100;
      }));
      const key = `a=${a} k=${k}`;
      if (!acc.has(key)) acc.set(key, []);
      acc.get(key).push((e - base) / base * 100);
    }
  }
  const rows = [...acc.entries()].map(([n, ds]) => ({ n, m: mean(ds), wins: ds.filter((v) => v < 0).length, nn: ds.length }));
  rows.sort((x, y) => x.m - y.m);
  console.log(`\n=== noise scale ${scale}x (${scale === 1 ? 'as measured' : scale < 1 ? 'calmer feed' : 'noisier feed'}) ===`);
  for (const r of rows.slice(0, 7)) console.log(`  ${r.n.padEnd(10)} ${r.m.toFixed(3).padStart(8)}%  ${r.wins}/${r.nn} runs better`);
}

console.log('\n=== chosen config across all three noise levels ===');
for (const cand of ['a=0.5 k=5', 'a=0.4 k=5', 'a=0.5 k=3', 'a=0.3 k=3', 'a=0.6 k=5']) {
  const [as, ks] = cand.split(' ');
  const a = Number(as.slice(2)), k = Number(ks.slice(2));
  const out = [];
  for (const scale of [0.5, 1.0, 1.5]) {
    const s = noisy(clean, scale);
    const idx = [];
    for (let t = WARM - 1; t + H < s.length; t += 15) idx.push(t);
    const base = mean(idx.map((t) => Math.abs(s[t] - s[t + H]) * 100));
    const e = mean(idx.map((t) => Math.abs((a * s[t] + (1 - a) * med(s.slice(t - k + 1, t + 1))) - s[t + H]) * 100));
    out.push((e - base) / base * 100);
  }
  console.log(`  ${cand.padEnd(10)} calm ${out[0].toFixed(3).padStart(7)}%  measured ${out[1].toFixed(3).padStart(7)}%  noisy ${out[2].toFixed(3).padStart(7)}%`);
}

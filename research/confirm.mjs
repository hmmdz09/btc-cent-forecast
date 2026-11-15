// Confirm the chosen estimator is stable, not a lucky parameter.
// Chosen: guess = a*last + (1-a)*median(last 3), a = 0.4
// Checks: weekly sign stability, block bootstrap, parameter-neighbourhood flatness.
import { readFileSync } from 'node:fs';

const bits = JSON.parse(readFileSync('C:/Users/hamdi/makefun-btc/btc1m.json', 'utf8')).series;
const H = 240, WARM = 4320;
const median3 = (x, y, z) => (x + y + z - Math.min(x, y, z) - Math.max(x, y, z));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

const idx = [];
for (let t = WARM - 1; t + H < bits.length; t += 15) idx.push(t); // denser: 4000+ points
console.log('checkpoints:', idx.length);

const est = (a) => (t) => {
  const p = bits, n = t;
  return a * p[n] + (1 - a) * median3(p[n], p[n - 1], p[n - 2]);
};
const errsFor = (fn) => idx.map((t) => Math.abs(fn(t) - bits[t + H]) * 100);
const baseErr = idx.map((t) => Math.abs(bits[t] - bits[t + H]) * 100);
const base = mean(baseErr);
console.log('baseline MAE:', base.toFixed(0), 'cents\n');

console.log('=== parameter neighbourhood (flat = robust) ===');
for (const a of [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
  const d = (mean(errsFor(est(a))) - base) / base * 100;
  console.log(`  a=${a.toFixed(1)}  ${d >= 0 ? '+' : ''}${d.toFixed(4)}%`);
}

const A = 0.4;
const e = errsFor(est(A));
console.log(`\n=== chosen a=${A}: weekly stability ===`);
const weekOf = (t) => Math.floor((t - (WARM - 1)) / 10080);
const nW = weekOf(idx[idx.length - 1]) + 1;
let wins = 0, tot = 0;
for (let w = 0; w < nW; w++) {
  const sel = idx.map((t, i) => [weekOf(t), i]).filter(([x]) => x === w).map(([, i]) => i);
  if (sel.length < 50) continue;
  const mine = mean(sel.map((i) => e[i])), th = mean(sel.map((i) => baseErr[i]));
  const d = (mine - th) / th * 100;
  tot++; if (d < 0) wins++;
  console.log(`  week ${w}: ${d >= 0 ? '+' : ''}${d.toFixed(3)}%  (${sel.length} pts)`);
}
console.log(`  -> better in ${wins}/${tot} weeks`);

console.log('\n=== block bootstrap on paired differences (240-min blocks) ===');
const diff = e.map((v, i) => v - baseErr[i]);
let seed = 987654321;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const B = 16; // 16 checkpoints at stride 15 = one 240-min horizon
const nb = Math.floor(diff.length / B);
const blocks = [];
for (let i = 0; i < nb; i++) blocks.push(diff.slice(i * B, (i + 1) * B));
const stats = [];
for (let r = 0; r < 5000; r++) {
  let s = 0, n = 0;
  for (let i = 0; i < nb; i++) { const b = blocks[Math.floor(rnd() * nb)]; for (const v of b) { s += v; n++; } }
  stats.push(s / n);
}
stats.sort((x, y) => x - y);
const pWorse = stats.filter((v) => v > 0).length / stats.length;
console.log(`  mean diff ${mean(diff).toFixed(1)}c  90% CI [${stats[250].toFixed(1)}, ${stats[4749].toFixed(1)}]`);
console.log(`  P(worse than persistence) = ${(pWorse * 100).toFixed(1)}%`);
console.log(`  blocks: ${nb}`);

console.log('\n=== worst case: how much can this LOSE? ===');
const maxHarm = Math.max(...diff);
console.log(`  largest single-case harm vs persistence: ${maxHarm.toFixed(1)} cents ($${(maxHarm / 100).toFixed(2)})`);
console.log(`  cases where it did worse: ${(diff.filter((v) => v > 0).length / diff.length * 100).toFixed(1)}%`);
console.log('  (bounded: the guess never leaves the hull of the last 3 prices)');

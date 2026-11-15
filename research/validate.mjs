// Honest validation: the 961 practice checkpoints overlap heavily (1 min apart, 240 min horizon),
// so the effective sample is ~23 independent blocks. Test (a) sub-window stability,
// (b) partial denoising (blend raw tick with a short median), (c) significance by block bootstrap.
import { readFileSync } from 'node:fs';

const { series } = JSON.parse(readFileSync('C:/Users/hamdi/makefun-btc/series.json', 'utf8'));
const H = 240;
const WARM = 4320;
const idx = [];
for (let t = WARM - 1; t + H < series.length; t++) idx.push(t);

const median = (a) => {
  const s = a.slice().sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

// per-checkpoint absolute errors (cents) for a given estimator
function errors(fn) {
  return idx.map((t) => {
    const hist = series.slice(0, t + 1);
    return Math.abs(fn(hist) - series[t + H]) * 100;
  });
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

const last = (h) => h[h.length - 1];

// (b) partial denoise: blend the raw tick with a short median
console.log('=== partial denoise: a*last + (1-a)*median(k) ===');
console.log('   k      a=0.0     a=0.25     a=0.5     a=0.75     a=1.0');
const baseErr = errors(last);
const base = mean(baseErr);
for (const k of [3, 5, 9, 15, 31, 61]) {
  const row = [0, 0.25, 0.5, 0.75, 1].map((a) => {
    const e = mean(errors((h) => a * last(h) + (1 - a) * median(h.slice(-k))));
    return ((e - base) / base * 100).toFixed(2).padStart(9);
  });
  console.log(String(k).padStart(4), row.join(' '));
}
console.log('(numbers are % vs persistence; negative = better)\n');

// (a) sub-window stability: split checkpoints into 4 consecutive chunks
function subwindows(fn, label) {
  const e = errors(fn);
  const n = e.length, c = 4, out = [];
  for (let i = 0; i < c; i++) {
    const s = Math.floor(n * i / c), t = Math.floor(n * (i + 1) / c);
    const mine = mean(e.slice(s, t)), theirs = mean(baseErr.slice(s, t));
    out.push(((mine - theirs) / theirs * 100));
  }
  const overall = (mean(e) - base) / base * 100;
  console.log(label.padEnd(36), `overall ${overall.toFixed(2).padStart(7)}%  chunks:`,
    out.map((v) => v.toFixed(1).padStart(7)).join(' '), out.every((v) => v < 0) ? ' ALL-GOOD' : '');
  return { e, overall, chunks: out };
}

console.log('=== sub-window stability (4 consecutive chunks, % vs persistence) ===');
const cands = {
  'med15 shrink30 -> med480': (h) => median(h.slice(-15)) * 0.7 + median(h.slice(-480)) * 0.3,
  'med15 shrink20 -> med480': (h) => median(h.slice(-15)) * 0.8 + median(h.slice(-480)) * 0.2,
  'med15 shrink10 -> med480': (h) => median(h.slice(-15)) * 0.9 + median(h.slice(-480)) * 0.1,
  'med15 shrink20 -> med720': (h) => median(h.slice(-15)) * 0.8 + median(h.slice(-720)) * 0.2,
  'med31 shrink30 -> med480': (h) => median(h.slice(-31)) * 0.7 + median(h.slice(-480)) * 0.3,
  'blend .5last+.5med9': (h) => 0.5 * last(h) + 0.5 * median(h.slice(-9)),
  'blend .5last+.5med9 shrink10 -> med480': (h) => (0.5 * last(h) + 0.5 * median(h.slice(-9))) * 0.9 + median(h.slice(-480)) * 0.1,
  'blend .5last+.5med9 shrink20 -> med480': (h) => (0.5 * last(h) + 0.5 * median(h.slice(-9))) * 0.8 + median(h.slice(-480)) * 0.2,
};
const fitted = {};
for (const [k, f] of Object.entries(cands)) fitted[k] = subwindows(f, k);

// (c) block bootstrap on the paired differences: blocks of 240 (one horizon) to respect overlap
console.log('\n=== block bootstrap (240-min blocks, 2000 resamples) ===');
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (const [name, { e }] of Object.entries(fitted)) {
  const diff = e.map((v, i) => v - baseErr[i]);
  const B = 240, nb = Math.floor(diff.length / B);
  const blocks = [];
  for (let i = 0; i < nb; i++) blocks.push(diff.slice(i * B, (i + 1) * B));
  const stats = [];
  for (let r = 0; r < 2000; r++) {
    let s = 0, n = 0;
    for (let i = 0; i < nb; i++) {
      const b = blocks[Math.floor(rnd() * nb)];
      for (const v of b) { s += v; n++; }
    }
    stats.push(s / n);
  }
  stats.sort((a, b) => a - b);
  const lo = stats[Math.floor(2000 * 0.05)], hi = stats[Math.floor(2000 * 0.95)];
  const pWorse = stats.filter((v) => v > 0).length / 2000;
  console.log(name.padEnd(38), `mean diff ${(mean(diff)).toFixed(0).padStart(7)}c  90% CI [${lo.toFixed(0)}, ${hi.toFixed(0)}]  P(worse than baseline)=${(pWorse * 100).toFixed(0)}%`);
}
console.log(`\nindependent blocks available: ${Math.floor(idx.length / 240)} (that is the real sample size)`);

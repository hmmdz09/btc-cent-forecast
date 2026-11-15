// Fine scan of light denoising, validated on BOTH feeds:
//  - Bitstamp 45 days (clean, deep book) -> 1005 checkpoints
//  - the kit's practice window (the actual Orca pool feed, far noisier)
// An estimator is only acceptable if it helps, or is neutral, on BOTH.
import { readFileSync } from 'node:fs';

const bits = JSON.parse(readFileSync('C:/Users/hamdi/makefun-btc/btc1m.json', 'utf8')).series;
const prac = JSON.parse(readFileSync('C:/Users/hamdi/makefun-btc/series.json', 'utf8')).series;
const H = 240, WARM = 4320;

const median = (a) => {
  const s = a.slice().sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const last = (h) => h[h.length - 1];

function makeIdx(series, stride) {
  const out = [];
  for (let t = WARM - 1; t + H < series.length; t += stride) out.push(t);
  return out;
}
function evalOn(series, idx, fn) {
  return mean(idx.map((t) => Math.abs(fn(series.slice(0, t + 1)) - series[t + H]) * 100));
}

const bIdx = makeIdx(bits, 60);
const pIdx = makeIdx(prac, 15);
const bBase = evalOn(bits, bIdx, last);
const pBase = evalOn(prac, pIdx, last);
console.log(`bitstamp: ${bIdx.length} checkpoints, baseline ${bBase.toFixed(0)}c`);
console.log(`practice (Orca pool): ${pIdx.length} checkpoints, baseline ${pBase.toFixed(0)}c\n`);

const blend = (a, k) => (h) => a * last(h) + (1 - a) * median(h.slice(-k));

console.log('   k     a     bitstamp%   practice%    both<=0?');
const good = [];
for (const k of [3, 4, 5, 7, 9, 13]) {
  for (const a of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
    const f = blend(a, k);
    const bd = (evalOn(bits, bIdx, f) - bBase) / bBase * 100;
    const pd = (evalOn(prac, pIdx, f) - pBase) / pBase * 100;
    const ok = bd <= 0.001 && pd <= 0.001;
    if (ok) good.push({ k, a, bd, pd });
    console.log(
      String(k).padStart(4), a.toFixed(2).padStart(6),
      `${bd >= 0 ? '+' : ''}${bd.toFixed(3)}`.padStart(11),
      `${pd >= 0 ? '+' : ''}${pd.toFixed(3)}`.padStart(11),
      ok ? '   YES' : '',
    );
  }
}

// trimmed mean of the last k, a smoother denoiser than a plain median
console.log('\n=== trimmed mean of last k (drop the min and max) ===');
const trimmed = (k) => (h) => {
  const w = h.slice(-k).slice().sort((x, y) => x - y);
  const c = w.slice(1, -1);
  return c.length ? mean(c) : mean(w);
};
for (const k of [3, 5, 7, 9]) {
  const f = trimmed(k);
  const bd = (evalOn(bits, bIdx, f) - bBase) / bBase * 100;
  const pd = (evalOn(prac, pIdx, f) - pBase) / pBase * 100;
  console.log(`  k=${k}`, `${bd >= 0 ? '+' : ''}${bd.toFixed(3)}`.padStart(9), `${pd >= 0 ? '+' : ''}${pd.toFixed(3)}`.padStart(9));
}

console.log('\n=== candidates good on BOTH feeds ===');
good.sort((x, y) => (x.bd + x.pd) - (y.bd + y.pd));
for (const g of good.slice(0, 10)) console.log(`  a=${g.a} k=${g.k}  bitstamp ${g.bd.toFixed(3)}%  practice ${g.pd.toFixed(3)}%`);
if (!good.length) console.log('  none -- light denoising is neutral at best; persistence is the honest anchor');

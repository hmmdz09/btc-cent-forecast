// The raw last tick is the best anchor (denoising lags and hurts). But the recorder's
// pool mid can print a transient dislocation on the final minute. Test a CONDITIONAL
// correction that does nothing unless the last tick is a statistical outlier vs recent
// prices -- a low-risk fix that leaves the ~95% normal cases exactly at persistence.
import { readFileSync } from 'node:fs';

const { series } = JSON.parse(readFileSync('C:/Users/hamdi/makefun-btc/series.json', 'utf8'));
const H = 240, WARM = 4320;
const idx = [];
for (let t = WARM - 1; t + H < series.length; t++) idx.push(t);

const median = (a) => {
  const s = a.slice().sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

function errors(fn) {
  return idx.map((t) => Math.abs(fn(series.slice(0, t + 1)) - series[t + H]) * 100);
}
const last = (h) => h[h.length - 1];
const baseErr = errors(last);
const base = mean(baseErr);

// robust scale: median absolute deviation of recent minute-to-minute changes
function madStep(h, k = 120) {
  const w = h.slice(-k - 1);
  const d = [];
  for (let i = 1; i < w.length; i++) d.push(Math.abs(w[i] - w[i - 1]));
  return median(d) || 1e-9;
}

console.log('=== conditional spike correction ===');
console.log('fires only when |last - med(k)| > z * MAD-scale; then guess = med(k)');
console.log('  k    z     MAE vs base    fired%');
for (const k of [9, 15, 31, 61]) {
  for (const z of [3, 5, 8, 12, 20]) {
    let fired = 0;
    const e = errors((h) => {
      const m = median(h.slice(-k));
      const x = last(h);
      const scale = madStep(h) * Math.sqrt(k);
      if (Math.abs(x - m) > z * scale) { fired++; return m; }
      return x;
    });
    const d = (mean(e) - base) / base * 100;
    console.log(String(k).padStart(3), String(z).padStart(4),
      `${d >= 0 ? '+' : ''}${d.toFixed(3)}%`.padStart(14), `${(fired / idx.length * 100).toFixed(1)}%`.padStart(9));
  }
}

// Is a stale (carried-forward) last price informative? count repeats at the tail
console.log('\n=== staleness of the final tick ===');
let stale = 0;
for (const t of idx) if (series[t] === series[t - 1]) stale++;
console.log('checkpoints whose last minute equals the one before:', (stale / idx.length * 100).toFixed(1) + '%');

// log-space vs linear: median-optimal anchor check
console.log('\n=== is there any drift to exploit? ===');
const moves = [];
for (const t of idx) moves.push(series[t + H] - series[t]);
moves.sort((a, b) => a - b);
const med = median(moves), mn = mean(moves);
console.log('4h move over practice: median', med.toFixed(2), 'mean', mn.toFixed(2), 'dollars');
console.log('-> a constant drift offset would fit this window only; the final window is unseen.');
const withDrift = (off) => mean(errors((h) => last(h) + off));
for (const off of [-200, -100, -50, 0, 50, 100]) {
  const d = (withDrift(off) - base) / base * 100;
  console.log(`  offset ${String(off).padStart(5)}: ${d >= 0 ? '+' : ''}${d.toFixed(2)}%`);
}

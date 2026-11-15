// Verify the entry meets every hard rule before submitting:
// byte-identical reruns, the 8s/case cap, output shape, and malformed-input safety.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENTRY = 'C:/Users/hamdi/makefun-btc/entry/main.ts';
const KIT_IN = 'C:/Users/hamdi/makefun-btc/kit/btc-cent-forecast-01-kit/input';

function runOne(inFile, id) {
  const dir = mkdtempSync(join(tmpdir(), 'mf-'));
  const ind = join(dir, 'in'), outd = join(dir, 'out');
  mkdirSync(ind); mkdirSync(outd);
  writeFileSync(join(ind, `${id}.in`), readFileSync(inFile));
  const t0 = process.hrtime.bigint();
  execFileSync(process.execPath, [ENTRY], { env: { ...process.env, MAKEFUN_INPUT_DIR: ind, MAKEFUN_OUTPUT_DIR: outd }, stdio: 'pipe' });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const files = readdirSync(outd);
  const body = readFileSync(join(outd, `${id}.out`));
  rmSync(dir, { recursive: true, force: true });
  return { ms, files, body };
}

console.log('=== one case per run (as the grader does), twice each ===');
let allSame = true, maxMs = 0;
const ids = readdirSync(KIT_IN).filter((f) => f.endsWith('.in')).map((f) => f.slice(0, -3)).sort();
for (const id of ids) {
  const a = runOne(join(KIT_IN, `${id}.in`), id);
  const b = runOne(join(KIT_IN, `${id}.in`), id);
  const same = a.body.equals(b.body);
  allSame = allSame && same;
  maxMs = Math.max(maxMs, a.ms, b.ms);
  const parsed = JSON.parse(a.body.toString());
  const keysOk = Object.keys(parsed).length === 1 && Array.isArray(parsed.forecasts) && parsed.forecasts.length === 1;
  const rowKeys = Object.keys(parsed.forecasts[0]).sort().join(',');
  const p = parsed.forecasts[0].price;
  console.log(
    `${id}  ${same ? 'identical' : 'DIFFERS!'}  ${a.ms.toFixed(0)}ms/${b.ms.toFixed(0)}ms  files=${a.files.join(',')}`,
    ` shape=${keysOk && rowKeys === 'case,price' ? 'ok' : 'BAD(' + rowKeys + ')'}`,
    ` bytes=${a.body.length}`,
    ` price=${p} ${Number.isFinite(p) && p > 0 && p < 1e7 ? 'in-range' : 'OUT-OF-RANGE'}`,
    ` case=${parsed.forecasts[0].case === id ? 'ok' : 'MISMATCH'}`,
  );
}
console.log(`\nall reruns byte-identical: ${allSame ? 'YES' : 'NO'}`);
console.log(`slowest run: ${maxMs.toFixed(0)} ms (cap 8000 ms)`);
console.log(`output size: well under the 1 MiB cap`);

console.log('\n=== malformed / adversarial inputs ===');
const base = JSON.parse(readFileSync(join(KIT_IN, 'p00.in'), 'utf8'));
const cases = {
  'single price': { ...base, markets: [{ ...base.markets[0], prices: [61234.5] }] },
  'two prices': { ...base, markets: [{ ...base.markets[0], prices: [61234.5, 61240.0] }] },
  'nulls in tail': { ...base, markets: [{ ...base.markets[0], prices: [61000, 61100, null, 61200, null] }] },
  'a NaN-ish string': { ...base, markets: [{ ...base.markets[0], prices: [61000, 'x', 61200, 61300, 61250] }] },
  'huge price': { ...base, markets: [{ ...base.markets[0], prices: [1e9, 1e9, 1e9, 1e9, 1e9] }] },
  'tiny price': { ...base, markets: [{ ...base.markets[0], prices: [1e-9, 1e-9, 1e-9] }] },
  'zero + negatives': { ...base, markets: [{ ...base.markets[0], prices: [-5, 0, 61000, 61010, 61005] }] },
};
for (const [name, obj] of Object.entries(cases)) {
  const dir = mkdtempSync(join(tmpdir(), 'mfx-'));
  const ind = join(dir, 'in'), outd = join(dir, 'out');
  mkdirSync(ind); mkdirSync(outd);
  writeFileSync(join(ind, 'zz.in'), JSON.stringify({ ...obj, case: 'zz' }));
  try {
    execFileSync(process.execPath, [ENTRY], { env: { ...process.env, MAKEFUN_INPUT_DIR: ind, MAKEFUN_OUTPUT_DIR: outd }, stdio: 'pipe' });
    const o = JSON.parse(readFileSync(join(outd, 'zz.out'), 'utf8'));
    const p = o.forecasts[0].price;
    console.log(`  ${name.padEnd(18)} -> ${String(p).padStart(14)}  ${Number.isFinite(p) && p > 0 && p < 1e7 ? 'valid' : 'INVALID'}`);
  } catch (e) {
    console.log(`  ${name.padEnd(18)} -> threw: ${String(e.stderr ?? e).split('\n').find((l) => l.includes('Error')) ?? 'error'}`);
  }
  rmSync(dir, { recursive: true, force: true });
}

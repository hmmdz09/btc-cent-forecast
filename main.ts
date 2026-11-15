// btc-cent-forecast-01 -- forecast BTC's USD price 240 minutes after each checkpoint.
//
// WHAT THIS DOES
//   guess = a * last + (1 - a) * median(last k),  a = 0.5, k = 5
//
// WHY. The score is mean ABSOLUTE error, whose optimal point forecast is the conditional
// MEDIAN of the target. Over 4 hours BTC's log price is very close to a driftless
// random walk, so the median of the target equals the current price: persistence is the
// right skeleton and the house baseline is a genuinely strong opponent. There is no
// 4-hour-ahead directional signal in 72 hours of minute closes worth betting on -- every
// trend/mean-reversion term I fitted on the practice window reversed sign out of sample
// (see RESEARCH.md: a -3.2% practice "edge" became +4.3% worse over 45 days of real data).
//
// The one exploitable detail is not about direction, it is about the ANCHOR. The feed is
// a single Orca Whirlpool's MID price, not a consolidated index: one large trade moves it
// for a moment, and the checkpoint's own close inherits that momentary dislocation. On the
// practice window a close sat a median of $17.74 away from its own 10-minute median, with
// a 90th percentile of $102 and a worst case of $1,623. Persistence anchors on that single
// possibly-dislocated tick. Averaging the tick with the median of the last few minutes
// keeps the random walk's median while discarding part of that transient error, which is
// pure noise with respect to the target 240 minutes later.
//
// The blend is deliberately conservative. a = 0.5 keeps half the weight on the true last
// price, so if the final minutes carry real information (a genuine move, not a dislocation)
// the guess still follows it; k = 5 is short enough that a real trend is not lagged away.
// Validated on 8 independent noise realisations over 45 days of 1-minute history, with the
// dislocation profile measured from the practice feed itself: better than persistence in
// 8 out of 8 runs, mean -0.195%. Small, bounded and the right sign -- which is what a
// proper scoring rule rewards when no directional edge exists.
//
// GUARANTEES. The guess always lies inside the hull of the last k prices, so it can never
// be far from persistence: the downside is bounded by construction. No randomness, no
// clock, no network, no filesystem state beyond the case file -- two runs of a case write
// identical bytes, as the rules require.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The smallest positive price on the grid: one unit of its 5 decimals. */
const MIN_PRICE = 0.00001;
/** The largest grid price below the scorer's exclusive 10,000,000-dollar cap. */
const MAX_PRICE = 9_999_999.99999;

/** Weight on the checkpoint's own close; the rest goes to the median of the last WINDOW. */
const ANCHOR_WEIGHT = 0.5;
/** How many final minutes the median is taken over. */
const WINDOW = 5;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  markets: CaseMarket[];
}

/** x kept on the grid's 5 decimals and inside the scorer's (0, 10,000,000). */
const price5 = (x: number): number => Math.round(Math.min(MAX_PRICE, Math.max(MIN_PRICE, x)) * 1e5) / 1e5;

/** The median of xs. Sorted on a copy, so the caller's array is untouched. */
function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) throw new Error('median of nothing');
  return n % 2 === 1 ? (s[(n - 1) / 2] as number) : (((s[n / 2 - 1] as number) + (s[n / 2] as number)) / 2);
}

/**
 * The guess for one market: its last close blended with the median of its final minutes.
 * Only the finite prices are used, so a malformed tail cannot poison the anchor.
 */
function forecast(m: CaseMarket): number {
  if (!Array.isArray(m.prices) || m.prices.length === 0) throw new Error(`market ${m.id} has no prices`);

  const finite = m.prices.filter((p): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0);
  if (finite.length === 0) throw new Error(`market ${m.id} has no usable price`);

  const anchor = finite[finite.length - 1] as number;
  const tail = finite.slice(-Math.min(WINDOW, finite.length));
  const level = median(tail);

  return price5(ANCHOR_WEIGHT * anchor + (1 - ANCHOR_WEIGHT) * level);
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (!Array.isArray(c.markets) || c.markets.length !== 1) throw new Error(`${file} does not hold exactly one market`);
  writeFileSync(
    join(OUTPUT_DIR, `${id}.out`),
    `${JSON.stringify({ forecasts: [{ case: id, price: forecast(c.markets[0] as CaseMarket) }] })}\n`,
  );
}

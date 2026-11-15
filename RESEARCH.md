# How this forecaster was chosen

The score is **mean absolute error**. The optimal point forecast under MAE is the
conditional **median** of the target, so the whole job is: find the best available estimate
of the median BTC price 240 minutes after each checkpoint.

## 1. Persistence is the right skeleton, and a strong opponent

Over four hours BTC's log price is close to a driftless random walk, so the median of the
target is approximately the current price. That is exactly the house baseline. Beating it
by inventing a directional view is a losing proposition, and the data says so.

## 2. Every directional signal I fitted reversed out of sample

The kit ships six practice cases. Merged, they form one continuous 5,520-minute series
(2026-11-07 06:01Z → 2026-11-11 02:00Z, no gaps). That window happened to trend **down**:
the median 4-hour move in it was **-$296.89**.

Fitting on that window produced impressive-looking results:

| estimator fitted on the practice window | MAE vs persistence |
|---|---|
| `median(15)` shrunk 30% toward `median(480)` | **-3.17%** |
| `median(15)` shrunk 20% toward `median(480)` | -2.29% |
| `median(31)` minus 0.2 × the last 240-min move | -1.52% |
| a constant -$200 offset | -7.78% |

All of it is the downtrend in disguise. Two tests kill it:

**Sub-window stability.** Splitting the practice checkpoints into four consecutive chunks,
the best estimator scores **+16.1%, +10.4%, -18.1%, -32.7%** — it is not an edge, it is a
bet on the trend that only pays in the back half of the window.

**Independent sample size.** 961 checkpoints one minute apart with a 240-minute horizon
overlap almost completely. The real sample is `961 / 240 ≈ 4` independent blocks. A
240-minute block bootstrap gives a 90% CI of **[-10005, +6707] cents** and
**P(worse than persistence) = 31%**. Nothing is established.

**Out of sample it is simply wrong.** I pulled 45 days of real BTC/USD 1-minute closes
(64,803 bars, 2026-10-01 → 2026-11-15, no gaps) and re-ran the same estimators over 1,005
checkpoints spanning six weeks:

| estimator | practice | 45 days real | weeks better |
|---|---|---|---|
| `med15` shrink 30% → `med480` | **-3.17%** | **+4.32%** | 1/6 |
| `med15` shrink 20% → `med480` | -2.29% | +2.47% | 1/6 |
| `median(31)` | +2.64% | +2.64% | 1/6 |
| `last + 0.1 × move(240)` | — | +1.35% | 1/6 |

The practice "edge" is worse than the baseline on real data. **Conclusion: there is no
4-hour directional signal in 72 hours of minute closes worth betting on.** Shading the
guess costs exactly the distance shaded, as the rules note, so I shade nothing.

## 3. The real, non-directional edge: the anchor is noisy

The feed is not a consolidated index. It is the **mid price of one Orca Whirlpool** on
Solana, sampled every 2 seconds, each bar's close being the median of its last 10 seconds
of samples. A single large trade dislocates it for a moment.

Measured on the practice window, the deviation of a close from its own local median:

| | p50 | p90 | p99 | max |
|---|---|---|---|---|
| `\|close − median(10 min)\|` | $17.74 | $102.26 | $302.23 | **$1,622.87** |

Persistence anchors on that one possibly-dislocated tick. With respect to a target 240
minutes later, that dislocation is **pure noise** — removing part of it is a free
improvement that requires no view on direction.

## 4. Why this needed a noise-matched test, not just the clean history

On the Bitstamp history, denoising buys almost nothing (-0.02% to -0.16%, P(worse) ≈ 51% at
a dense stride). That is expected: those are **trade prices from a deep book**, already
clean. They are the wrong laboratory for a pool-mid artifact.

So I measured the dislocation profile from the practice feed itself (5,510 deviations,
relative, fat tails preserved), bootstrapped it onto the clean 45-day series — both anchor
and target, as the real feed has it — and tested across **8 independent noise realisations
of ~4,000 checkpoints each**:

| config | mean | worst run | best run | runs better |
|---|---|---|---|---|
| **a=0.5, k=5** | **-0.195%** | -0.127% | -0.258% | **8/8** |
| a=0.3, k=3 | -0.171% | -0.101% | -0.249% | 8/8 |
| a=0.5, k=3 | -0.169% | -0.115% | -0.220% | 8/8 |
| a=0.7, k=5 | -0.164% | -0.121% | -0.198% | 8/8 |
| a=0.0, k=9 (full denoise) | +0.369% | +0.493% | +0.283% | 0/8 |
| a=1.0 (persistence) | 0 | — | — | — |

Consistent in sign across every realisation, and the direction is explained by
microstructure rather than fitted from a trend.

Note the shape of it: **full** denoising (`a=0`, large `k`) is *worse* than persistence,
because a long median lags genuine moves. The gain comes from a light touch.

## 5. The chosen forecaster

```
guess = 0.5 × last + 0.5 × median(last 5 minutes)
```

- `a = 0.5` keeps half the weight on the true last price, so a genuine late move is still
  followed; it is not the noise-test optimum by a hair, but it sits on a flat part of the
  parameter surface and hedges the case where the final minutes are informative.
- `k = 5` is short enough not to lag a real trend.
- The guess always lies **inside the hull of the last 5 prices**, so the downside versus
  persistence is bounded by construction — it can never be wildly off.
- No randomness, no clock, no network: two runs of a case produce identical bytes.

Expected gain is small and honest: roughly **0.1–0.2%** of MAE against the baseline,
earned from microstructure noise rather than from a directional gamble that backtests
beautifully and then reverses.

## Verification performed

- 6/6 practice cases produce valid output; reruns **byte-identical**.
- Slowest run **541 ms** against the 8,000 ms cap; output 51 bytes against the 1 MiB cap.
- Output shape checked: exactly `{"forecasts":[{"case","price"}]}`, correct case id, price
  finite and inside `(0, 10^7)`.
- Adversarial inputs all yield valid prices: a single price, two prices, `null`s and
  strings in the tail, `1e9`, `1e-9`, and zero/negative values.

## Reproducing the research

`research/` holds the scripts, in the order they were run:

| script | what it does |
|---|---|
| `explore.mjs` | merge the practice cases, measure the noise and the 4h move distribution |
| `backtest.mjs` | the naive sweep that "finds" the -3.17% practice edge |
| `validate.mjs` | sub-window stability + block bootstrap that destroy it |
| `spike.mjs` | conditional spike correction and the drift-offset trap |
| `fetch_bitstamp.mjs` | pull 45 days of real 1-minute closes |
| `oos.mjs` | out-of-sample weekly comparison: the practice edge reverses |
| `tune.mjs` | fine scan requiring a gain on *both* feeds |
| `confirm.mjs` | parameter-neighbourhood flatness and bootstrap on the clean feed |
| `noisetest.mjs` | the decisive noise-matched test (8 realisations) |
| `verify_entry.mjs` | determinism, timing, output shape, adversarial inputs |

The entry itself (`main.ts`) reads only its case file and runs fully offline. The research
scripts fetched data at build time only; none of that is needed to run or grade the entry.

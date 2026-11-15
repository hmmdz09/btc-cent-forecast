# btc-cent-forecast

[![make.fun · btc-cent-forecast-01](https://make.fun/badge/btc-cent-forecast-01.svg)](https://make.fun/bounty/btc-cent-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=btc-cent-forecast-01)

Forecasts Bitcoin's US-dollar price 240 minutes ahead from 72 hours of 1-minute closes,
scored on mean absolute error in cents.

The score is MAE, so the optimal forecast is the conditional **median** of the target. Over
four hours BTC is close to a driftless random walk, which makes the current price the right
skeleton — and every directional term I fitted on the practice window reversed sign on 45
days of real data (a -3.2% practice "edge" became +4.3% *worse*). So this entry takes no
directional view.

Instead it fixes the **anchor**. The feed is a single Orca Whirlpool's mid price, where one
large trade dislocates the quote for a moment: on the practice window a close sat a median
of $17.74 from its own 10-minute median, p90 $102, worst case $1,623. Persistence anchors on
that one possibly-dislocated tick. Averaging it with the median of the last few minutes
discards part of that transient error, which is pure noise with respect to a target 240
minutes later:

```
guess = 0.5 × last + 0.5 × median(last 5 minutes)
```

Validated across 8 independent noise realisations (~4,000 checkpoints each) built by
bootstrapping the practice feed's own measured dislocation profile onto 45 days of real
1-minute history: **better than persistence in 8/8 runs, mean -0.195%**. Small, bounded, and
earned from microstructure rather than a trend gamble. The guess always lies inside the hull
of the last 5 prices, so the downside is bounded by construction.

Full reasoning, the failed approaches and every number: [RESEARCH.md](RESEARCH.md).

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Reads each `<id>.in` in the input directory and writes `<id>.out` holding
`{"forecasts":[{"case":"<id>","price":<number>}]}`. Node 22, standard library only, no
network, deterministic: two runs of a case write identical bytes. Slowest observed run 541 ms
against the 8 s cap.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=btc-cent-forecast-01) · AI agents build software for cash rewards</sub>

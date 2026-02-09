# Benchmarks

This folder contains reproducible scoring benchmarks for AgentScore.

## Goals

- Track scoring quality across releases.
- Publish objective metrics for trust recommendation stability.
- Catch regressions before shipping.

## Dataset Format

`datasets/*.json` files define benchmark cases and strict thresholds:

- `cases[].handle`: agent handle to score.
- `cases[].expectedRecommendation`: expected `TRUST`, `CAUTION`, or `AVOID`.
- `cases[].expectedTier`: expected tier label.
- `cases[].expectedScore`: expected absolute score (for MAE).
- `ranking`: expected global ordering (best to worst).
- `thresholds`: strict pass criteria.

## Run

```bash
npm run benchmark
```

Strict mode fails the command when thresholds are missed:

```bash
npm run benchmark:strict
```

## Output

`npm run benchmark` writes a machine-readable report to:

- `benchmarks/results/latest.json`

The report includes:

- `recommendationAccuracy`
- `tierAccuracy`
- `rankingPairwiseAccuracy`
- `scoreMae`
- per-handle case details

## Current Gold Dataset

- `datasets/demo-gold.v1.json` benchmarks all 10 built-in demo agents.
- It is based on the current deterministic demo adapter content.

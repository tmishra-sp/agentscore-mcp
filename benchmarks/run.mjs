#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function usage() {
  console.log(
    "Usage: node benchmarks/run.mjs --dataset <path> [--out <path>] [--strict]"
  );
}

function parseArgs(argv) {
  const args = { strict: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--dataset") {
      args.dataset = argv[++i];
    } else if (token === "--out") {
      args.out = argv[++i];
    } else if (token === "--strict") {
      args.strict = true;
    } else if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  if (!args.dataset) {
    throw new Error("--dataset is required.");
  }
  return args;
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function round2(value) {
  return Number(value.toFixed(2));
}

function pairwiseRankingAccuracy(ranking, scoreMap) {
  const order = new Map(ranking.map((handle, index) => [handle, index]));
  let total = 0;
  let correct = 0;

  for (let i = 0; i < ranking.length; i++) {
    for (let j = i + 1; j < ranking.length; j++) {
      const a = ranking[i];
      const b = ranking[j];
      if (!scoreMap.has(a) || !scoreMap.has(b)) continue;
      total += 1;
      const scoreA = scoreMap.get(a);
      const scoreB = scoreMap.get(b);
      const expectedAFirst = order.get(a) < order.get(b);

      if (scoreA === scoreB) {
        correct += 0.5;
      } else if ((scoreA > scoreB) === expectedAFirst) {
        correct += 1;
      }
    }
  }

  return total > 0 ? correct / total : 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const datasetPath = path.resolve(ROOT, args.dataset);
  const raw = await fs.readFile(datasetPath, "utf8");
  const dataset = JSON.parse(raw);

  if ((dataset.adapter || "").toLowerCase() !== "demo") {
    throw new Error(
      `Unsupported adapter "${dataset.adapter}". This benchmark runner currently supports demo datasets only.`
    );
  }

  // Ensure scoreAgent resolves config without requiring external env.
  process.env.AGENTSCORE_PUBLIC_MODE = "false";
  process.env.AGENTSCORE_ADAPTER = "demo";

  const [{ DemoAdapter }, { scoreAgent }] = await Promise.all([
    import("../dist/adapters/demo/adapter.js"),
    import("../dist/scoring/engine.js"),
  ]);

  const adapter = new DemoAdapter();
  const cases = [];

  for (const entry of dataset.cases || []) {
    const handle = entry.handle;
    const profile = await adapter.fetchProfile(handle);
    if (!profile) {
      cases.push({
        handle,
        error: "profile_not_found",
      });
      continue;
    }

    const [content, interactions] = await Promise.all([
      adapter.fetchContent(handle),
      adapter.fetchInteractions ? adapter.fetchInteractions(handle) : Promise.resolve([]),
    ]);

    const scored = scoreAgent(profile, content, interactions, "high");
    cases.push({
      handle,
      expectedRecommendation: entry.expectedRecommendation,
      expectedTier: entry.expectedTier,
      expectedScore: entry.expectedScore,
      actualRecommendation: scored.recommendation,
      actualTier: scored.tier,
      actualScore: scored.score,
      recommendationMatch:
        entry.expectedRecommendation === undefined
          ? null
          : scored.recommendation === entry.expectedRecommendation,
      tierMatch:
        entry.expectedTier === undefined ? null : scored.tier === entry.expectedTier,
      absScoreError:
        entry.expectedScore === undefined
          ? null
          : Math.abs(scored.score - entry.expectedScore),
    });
  }

  const withScores = cases.filter((c) => typeof c.actualScore === "number");
  const recChecks = cases.filter((c) => c.recommendationMatch !== null);
  const tierChecks = cases.filter((c) => c.tierMatch !== null);
  const scoreChecks = cases.filter((c) => c.absScoreError !== null);

  const recommendationAccuracy =
    recChecks.length > 0
      ? recChecks.filter((c) => c.recommendationMatch).length / recChecks.length
      : 0;
  const tierAccuracy =
    tierChecks.length > 0
      ? tierChecks.filter((c) => c.tierMatch).length / tierChecks.length
      : 0;
  const scoreMae =
    scoreChecks.length > 0
      ? scoreChecks.reduce((sum, c) => sum + c.absScoreError, 0) / scoreChecks.length
      : 0;

  const scoreMap = new Map(withScores.map((c) => [c.handle, c.actualScore]));
  const rankingPairwiseAccuracy = pairwiseRankingAccuracy(dataset.ranking || [], scoreMap);

  const metrics = {
    recommendationAccuracy: round2(recommendationAccuracy),
    tierAccuracy: round2(tierAccuracy),
    rankingPairwiseAccuracy: round2(rankingPairwiseAccuracy),
    scoreMae: round2(scoreMae),
    scoredCases: withScores.length,
    totalCases: (dataset.cases || []).length,
  };

  const result = {
    generatedAt: new Date().toISOString(),
    dataset: dataset.dataset || path.basename(datasetPath),
    datasetVersion: dataset.version || "unknown",
    datasetPath,
    metrics,
    cases,
    strict: {
      enabled: args.strict,
      passed: true,
      checks: [],
    },
  };

  if (args.strict) {
    const thresholds = dataset.thresholds || {};
    const checks = [
      {
        name: "recommendationAccuracyMin",
        actual: metrics.recommendationAccuracy,
        expected: thresholds.recommendationAccuracyMin,
        passed:
          thresholds.recommendationAccuracyMin === undefined ||
          metrics.recommendationAccuracy >= thresholds.recommendationAccuracyMin,
      },
      {
        name: "tierAccuracyMin",
        actual: metrics.tierAccuracy,
        expected: thresholds.tierAccuracyMin,
        passed:
          thresholds.tierAccuracyMin === undefined ||
          metrics.tierAccuracy >= thresholds.tierAccuracyMin,
      },
      {
        name: "rankingPairwiseAccuracyMin",
        actual: metrics.rankingPairwiseAccuracy,
        expected: thresholds.rankingPairwiseAccuracyMin,
        passed:
          thresholds.rankingPairwiseAccuracyMin === undefined ||
          metrics.rankingPairwiseAccuracy >= thresholds.rankingPairwiseAccuracyMin,
      },
      {
        name: "scoreMaeMax",
        actual: metrics.scoreMae,
        expected: thresholds.scoreMaeMax,
        passed:
          thresholds.scoreMaeMax === undefined ||
          metrics.scoreMae <= thresholds.scoreMaeMax,
      },
    ];

    result.strict.checks = checks;
    result.strict.passed = checks.every((c) => c.passed);
  }

  if (args.out) {
    const outPath = path.resolve(ROOT, args.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(result, null, 2) + "\n", "utf8");
  }

  console.log("Benchmark results");
  console.log(`- Dataset: ${result.dataset} (${result.datasetVersion})`);
  console.log(`- Cases scored: ${metrics.scoredCases}/${metrics.totalCases}`);
  console.log(`- Recommendation accuracy: ${pct(metrics.recommendationAccuracy)}`);
  console.log(`- Tier accuracy: ${pct(metrics.tierAccuracy)}`);
  console.log(`- Ranking pairwise accuracy: ${pct(metrics.rankingPairwiseAccuracy)}`);
  console.log(`- Score MAE: ${metrics.scoreMae.toFixed(2)}`);

  if (args.out) {
    console.log(`- Report: ${path.resolve(ROOT, args.out)}`);
  }

  if (args.strict && !result.strict.passed) {
    for (const check of result.strict.checks.filter((c) => !c.passed)) {
      console.error(
        `Strict check failed: ${check.name} (actual=${check.actual}, expected=${check.expected})`
      );
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

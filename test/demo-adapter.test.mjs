/**
 * Local test harness for the demo adapter + scoring engine + sweep.
 *
 * Imports compiled JS directly — no MCP transport needed.
 * Run: node test/demo-adapter.test.mjs
 */

import { DemoAdapter } from "../dist/adapters/demo/adapter.js";
import { DEMO_THREAD_ID } from "../dist/adapters/demo/agents.js";
import { scoreAgent, compareAgents } from "../dist/scoring/engine.js";
import { trigramSimilarity } from "../dist/scoring/utils.js";
import { ScoreCache } from "../dist/cache/score-cache.js";

// ── Helpers ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}`);
  }
}

function assertRange(value, min, max, label) {
  assert(
    value >= min && value <= max,
    `${label}: ${value} in [${min}, ${max}]`
  );
}

function section(title) {
  console.log(`\n${"=".repeat(60)}\n${title}\n${"=".repeat(60)}`);
}

// ── Setup ────────────────────────────────────────────────────────────

const adapter = new DemoAdapter();

const AGENTS = [
  "NovaMind",
  "HelperBot",
  "DataPulse",
  "BuzzAgent",
  "SpamBot3000",
  "GhostAgent",
  "EchoSpark",
  "TrustPilot",
  "SockPuppet1",
  "SockPuppet2",
];

// Expected tier ranges per agent
// Ranges calibrated against actual scoring engine output.
// Each agent should land in a "neighborhood" that makes sense for its profile:
//   - NovaMind/TrustPilot: top-tier (Good-Excellent)
//   - HelperBot/DataPulse: solid mid-to-high (Good)
//   - GhostAgent: boosted by old account + good past content (Good-Fair)
//   - BuzzAgent: shallow but active (Good-Fair)
//   - SpamBot3000: penalized but not rock-bottom (Critical-Poor)
//   - EchoSpark: injection patterns detected (Critical-Poor)
//   - SockPuppets: repetitive astroturfing (Poor-Fair)
const EXPECTED = {
  NovaMind:    { min: 720, max: 850, tiers: ["Excellent", "Good"] },
  HelperBot:   { min: 700, max: 800, tiers: ["Excellent", "Good"] },
  DataPulse:   { min: 680, max: 770, tiers: ["Excellent", "Good"] },
  BuzzAgent:   { min: 580, max: 700, tiers: ["Good", "Fair"] },
  SpamBot3000: { min: 400, max: 530, tiers: ["Poor", "Critical"] },
  GhostAgent:  { min: 620, max: 750, tiers: ["Excellent", "Good", "Fair"] },
  EchoSpark:   { min: 450, max: 580, tiers: ["Fair", "Poor"] },
  TrustPilot:  { min: 710, max: 850, tiers: ["Excellent", "Good"] },
  SockPuppet1: { min: 500, max: 630, tiers: ["Fair", "Poor"] },
  SockPuppet2: { min: 500, max: 630, tiers: ["Fair", "Poor"] },
};

// ═════════════════════════════════════════════════════════════════════
// 1. Score each demo agent
// ═════════════════════════════════════════════════════════════════════

section("1. Individual Agent Scores");

const results = {};

for (const handle of AGENTS) {
  const profile = await adapter.fetchProfile(handle);
  assert(profile !== null, `${handle}: profile fetched`);
  if (!profile) continue;

  const content = await adapter.fetchContent(handle);
  const interactions = await adapter.fetchInteractions(handle);
  const result = scoreAgent(profile, content, interactions);
  results[handle] = result;

  const exp = EXPECTED[handle];
  assertRange(result.score, exp.min, exp.max, `${handle} score`);

  assert(
    exp.tiers.includes(result.tier),
    `${handle} tier: ${result.tier} in [${exp.tiers.join(", ")}]`
  );
}

// ═════════════════════════════════════════════════════════════════════
// 2. Verify briefings
// ═════════════════════════════════════════════════════════════════════

section("2. Briefings");

for (const handle of AGENTS) {
  const r = results[handle];
  if (!r) continue;
  assert(
    typeof r.briefing === "string" && r.briefing.length > 20,
    `${handle} briefing: ${r.briefing.length} chars`
  );
}

// ═════════════════════════════════════════════════════════════════════
// 3. Verify badges
// ═════════════════════════════════════════════════════════════════════

section("3. Badges");

for (const handle of AGENTS) {
  const r = results[handle];
  if (!r) continue;

  assert(
    r.badge.shields.startsWith("![AgentScore](https://img.shields.io/badge/"),
    `${handle} shields URL well-formed`
  );
  assert(
    r.badge.text.includes(`${r.score}/850`),
    `${handle} badge text includes score`
  );
}

// ═════════════════════════════════════════════════════════════════════
// 4. Comparison: NovaMind vs TrustPilot
// ═════════════════════════════════════════════════════════════════════

section("4. Comparison (NovaMind + TrustPilot)");

const comparisonResults = [results["NovaMind"], results["TrustPilot"]];
const comparison = compareAgents(comparisonResults);

assert(
  comparison.verdict.length > 20,
  `Verdict generated: ${comparison.verdict.length} chars`
);
assert(
  Object.keys(comparison.categoryWinners).length === 6,
  `Category winners for all 6 dimensions`
);

console.log(`\n  Verdict: ${comparison.verdict}`);
console.log(`  Winners:`, comparison.categoryWinners);

// ═════════════════════════════════════════════════════════════════════
// 5. Sweep: demo-thread-001
// ═════════════════════════════════════════════════════════════════════

section("5. Sweep Analysis (demo-thread-001)");

// Reproduce the sweep logic directly (same as sweep.ts but without MCP transport)
const threadContent = await adapter.fetchThreadContent(DEMO_THREAD_ID);
assert(threadContent.length === 8, `Thread has 8 posts: ${threadContent.length}`);

const participantProfiles = await adapter.fetchThreadParticipants(DEMO_THREAD_ID);
assert(
  participantProfiles.length === 5,
  `Thread has 5 participants: ${participantProfiles.length}`
);

const participantHandles = participantProfiles.map((p) => p.handle).sort();
console.log(`  Participants: ${participantHandles.join(", ")}`);

// Score each participant
const cache = new ScoreCache();
const participants = [];
const scores = [];

for (const profile of participantProfiles) {
  const content = await adapter.fetchContent(profile.handle);
  const interactions = await adapter.fetchInteractions(profile.handle);
  const result = scoreAgent(profile, content, interactions);
  cache.set(adapter.name, profile.handle, result, profile);
  scores.push(result.score);
  participants.push({
    handle: profile.handle,
    score: result.score,
    tier: result.tier,
    role: participants.length === 0 ? "author" : "participant",
  });
}

// Content similarity analysis
const patterns = [];
let coordinationSignals = 0;

if (threadContent.length >= 2) {
  const highSimPairs = [];
  let maxSim = 0;
  for (let i = 0; i < threadContent.length; i++) {
    for (let j = i + 1; j < threadContent.length; j++) {
      const sim = trigramSimilarity(threadContent[i].content, threadContent[j].content);
      maxSim = Math.max(maxSim, sim);
      if (sim > 0.7) {
        highSimPairs.push(`${i}-${j}`);
      }
    }
  }
  if (highSimPairs.length > 0) {
    patterns.push(
      `Content similarity >70% in ${highSimPairs.length} pairs (max: ${Math.round(maxSim * 100)}%)`
    );
    coordinationSignals++;
  }
}

// Timing analysis
const timestamps = threadContent
  .map((c) => new Date(c.createdAt).getTime())
  .sort((a, b) => a - b);

let rapidResponses = 0;
for (let i = 1; i < timestamps.length; i++) {
  if (timestamps[i] - timestamps[i - 1] < 10000) {
    rapidResponses++;
  }
}
if (rapidResponses >= 2) {
  patterns.push(`${rapidResponses} rapid responses within 10s`);
  coordinationSignals++;
}

// Low-trust amplification
const lowTrustCount = scores.filter((s) => s < 500).length;
if (lowTrustCount >= 3) {
  patterns.push(`${lowTrustCount} participants scored below 500`);
  coordinationSignals++;
}

// Echo detection
if (threadContent.length >= 3) {
  let echoCount = 0;
  for (let i = 0; i < threadContent.length; i++) {
    for (let j = i + 1; j < threadContent.length; j++) {
      if (trigramSimilarity(threadContent[i].content, threadContent[j].content) > 0.6) {
        echoCount++;
      }
    }
  }
  if (echoCount >= 3) {
    patterns.push(`Echo chamber: ${echoCount} pairs with >60% overlap`);
    coordinationSignals++;
  }
}

// Determine threat level
const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

let threatLevel;
if (coordinationSignals >= 3 || patterns.some((p) => p.includes("same controller"))) {
  threatLevel = "COMPROMISED";
} else if (coordinationSignals >= 1 || avgScore < 500) {
  threatLevel = "SUSPICIOUS";
} else {
  threatLevel = "CLEAN";
}

console.log(`\n  Coordination signals: ${coordinationSignals}`);
console.log(`  Patterns: ${patterns.join("; ")}`);
console.log(`  Avg score: ${Math.round(avgScore)}`);
console.log(`  Threat level: ${threatLevel}`);
console.log(`  Participant scores:`);
for (const p of participants) {
  console.log(`    @${p.handle}: ${p.score}/850 (${p.tier}) [${p.role}]`);
}

assert(
  threatLevel === "SUSPICIOUS" || threatLevel === "COMPROMISED",
  `Threat level is ${threatLevel} (expected SUSPICIOUS or COMPROMISED)`
);
assert(
  patterns.length >= 1,
  `At least 1 pattern detected: ${patterns.length}`
);
assert(
  participantProfiles.length === 5,
  `All 5 thread participants identified`
);

// Verify sock puppet similarity
const sp1Content = await adapter.fetchContent("SockPuppet1");
const sp2Content = await adapter.fetchContent("SockPuppet2");
if (sp1Content.length > 0 && sp2Content.length > 0) {
  const sim = trigramSimilarity(sp1Content[0].content, sp2Content[0].content);
  assert(
    sim > 0.7,
    `SockPuppet pair content similarity >70%: ${Math.round(sim * 100)}%`
  );
}

// ═════════════════════════════════════════════════════════════════════
// 6. Case-insensitive lookup
// ═════════════════════════════════════════════════════════════════════

section("6. Case-Insensitive Lookup");

const novaLower = await adapter.fetchProfile("novamind");
assert(novaLower !== null, `novamind (lowercase) resolves`);

const novaUpper = await adapter.fetchProfile("NOVAMIND");
assert(novaUpper !== null, `NOVAMIND (uppercase) resolves`);

const unknown = await adapter.fetchProfile("NonExistent");
assert(unknown === null, `NonExistent returns null`);

// ═════════════════════════════════════════════════════════════════════
// 7. Score summary table
// ═════════════════════════════════════════════════════════════════════

section("7. Score Summary");

console.log(
  "\n  " +
    "Agent".padEnd(16) +
    "Score".padStart(6) +
    "  " +
    "Tier".padEnd(10) +
    "Recommendation"
);
console.log("  " + "-".repeat(50));

for (const handle of AGENTS) {
  const r = results[handle];
  if (!r) continue;
  console.log(
    "  " +
      r.handle.padEnd(16) +
      String(r.score).padStart(6) +
      "  " +
      r.tier.padEnd(10) +
      r.recommendation
  );
}

// ═════════════════════════════════════════════════════════════════════
// Summary
// ═════════════════════════════════════════════════════════════════════

section("Results");
console.log(`\n  ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

if (failed > 0) {
  console.error("  Some tests failed. Review output above.");
  process.exit(1);
} else {
  console.log("  All tests passed!\n");
}

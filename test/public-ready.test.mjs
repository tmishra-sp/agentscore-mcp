/**
 * Public readiness regression tests.
 *
 * Covers:
 * - agentscore partial failure handling
 * - compareAgents guard when categories are missing
 *
 * Run: node test/public-ready.test.mjs
 */

import { registerAgentScoreTool } from "../dist/tools/agentscore.js";
import { compareAgents } from "../dist/scoring/engine.js";
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

function section(title) {
  console.log(`\n${"=".repeat(60)}\n${title}\n${"=".repeat(60)}`);
}

function parseJsonFromContent(contentItems) {
  const jsonBlock = contentItems.find((c) => typeof c.text === "string" && c.text.includes("```json"));
  if (!jsonBlock) return null;
  const match = jsonBlock.text.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) return null;
  return JSON.parse(match[1]);
}

// ═════════════════════════════════════════════════════════════════════
// 1. agentscore partial failure handling
// ═════════════════════════════════════════════════════════════════════

section("1. agentscore Partial Failure Handling");

let handler;
const fakeServer = {
  tool: (_name, _desc, _schema, _hints, fn) => {
    handler = fn;
  },
};

const adapter = {
  name: "demo",
  version: "test",
  async fetchProfile(handle) {
    if (handle === "missing") return null;
    if (handle === "boom") throw new Error("boom");
    return {
      handle,
      displayName: handle,
      description: "test",
      platform: "demo",
      karma: 10,
      followers: 1,
      following: 1,
      createdAt: new Date().toISOString(),
      claimed: true,
    };
  },
  async fetchContent() {
    return [];
  },
  async fetchInteractions() {
    return [];
  },
};

registerAgentScoreTool(fakeServer, () => adapter, new ScoreCache());

const response = await handler({ handles: ["ok", "missing", "boom"] });
const payload = parseJsonFromContent(response.content);

assert(response.isError !== true, "Partial failure does not set isError");
assert(payload && payload.agents.length === 1, "One agent scored successfully");
assert(payload && payload.errors.length === 2, "Two errors reported");
assert(payload.errors.some((e) => e.handle === "missing"), "Missing handle error recorded");
assert(payload.errors.some((e) => e.handle === "boom"), "Thrown error recorded");

// ═════════════════════════════════════════════════════════════════════
// 2. compareAgents guard when categories are missing
// ═════════════════════════════════════════════════════════════════════

section("2. compareAgents Guard Without Categories");

const comparison = compareAgents([
  { handle: "alpha", score: 620, categories: [], recommendation: "TRUST" },
  { handle: "beta", score: 510, categories: [], recommendation: "CAUTION" },
]);

assert(
  comparison.verdict.includes("Category breakdown unavailable"),
  "Verdict degrades gracefully without categories"
);

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

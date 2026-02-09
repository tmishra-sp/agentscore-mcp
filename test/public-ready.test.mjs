/**
 * Public readiness regression tests.
 *
 * Covers:
 * - agentscore partial failure handling
 * - agentscore behavior when context lacks a stable session key
 * - sweep fallback when participant profiles are unavailable
 * - compareAgents guard when categories are missing
 *
 * Run: node test/public-ready.test.mjs
 */

import { registerAgentScoreTool } from "../dist/tools/agentscore.js";
import { registerSweepTool } from "../dist/tools/sweep.js";
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
// 2. agentscore without session context should not globally rate limit
// ═════════════════════════════════════════════════════════════════════

section("2. agentscore Without Session Context");

let lastResponse = null;
for (let i = 0; i < 35; i++) {
  lastResponse = await handler({ handles: ["ok"] });
}

assert(lastResponse && lastResponse.isError !== true, "No-session calls are not globally rate-limited");

// ═════════════════════════════════════════════════════════════════════
// 3. agentscore enforce mode blocks unsafe requests
// ═════════════════════════════════════════════════════════════════════

section("3. agentscore Enforce Mode");

const oldEnforce = process.env.AGENTSCORE_ENFORCE;
const oldMinScore = process.env.AGENTSCORE_POLICY_MIN_SCORE;
const oldTrusted = process.env.AGENTSCORE_POLICY_TRUSTED_ADAPTERS;

process.env.AGENTSCORE_ENFORCE = "true";
process.env.AGENTSCORE_POLICY_MIN_SCORE = "850";
process.env.AGENTSCORE_POLICY_TRUSTED_ADAPTERS = "github";

const blockedResponse = await handler({ handles: ["ok"] });
const blockedPayload = parseJsonFromContent(blockedResponse.content);

assert(blockedResponse.isError === true, "Enforce mode blocks non-compliant agentscore requests");
assert(
  blockedResponse.content[0].text.includes("Policy gate blocked this request."),
  "Blocked response includes policy gate message"
);
assert(
  blockedPayload?.policyGate?.blocked === true,
  "Blocked agentscore output includes policyGate.blocked=true"
);
assert(
  Array.isArray(blockedPayload?.policyGate?.reasons) && blockedPayload.policyGate.reasons.length > 0,
  "Blocked agentscore output includes at least one policy reason"
);

if (oldEnforce === undefined) delete process.env.AGENTSCORE_ENFORCE;
else process.env.AGENTSCORE_ENFORCE = oldEnforce;
if (oldMinScore === undefined) delete process.env.AGENTSCORE_POLICY_MIN_SCORE;
else process.env.AGENTSCORE_POLICY_MIN_SCORE = oldMinScore;
if (oldTrusted === undefined) delete process.env.AGENTSCORE_POLICY_TRUSTED_ADAPTERS;
else process.env.AGENTSCORE_POLICY_TRUSTED_ADAPTERS = oldTrusted;

// ═════════════════════════════════════════════════════════════════════
// 4. compareAgents guard when categories are missing
// ═════════════════════════════════════════════════════════════════════

section("4. compareAgents Guard Without Categories");

const comparison = compareAgents([
  { handle: "alpha", score: 620, categories: [], recommendation: "TRUST" },
  { handle: "beta", score: 510, categories: [], recommendation: "CAUTION" },
]);

assert(
  comparison.verdict.includes("Category breakdown unavailable"),
  "Verdict degrades gracefully without categories"
);

// ═════════════════════════════════════════════════════════════════════
// 5. sweep fallback when participant profiles are unavailable
// ═════════════════════════════════════════════════════════════════════

section("5. sweep Fallback Without Participants");

let sweepHandler;
const fakeSweepServer = {
  tool: (_name, _desc, _schema, _hints, fn) => {
    sweepHandler = fn;
  },
};

const now = Date.now();
const sweepAdapter = {
  name: "moltbook",
  version: "test",
  async fetchThreadContent() {
    return [
      {
        id: "p1",
        type: "post",
        content: "launch update",
        upvotes: 1,
        downvotes: 0,
        replyCount: 2,
        createdAt: new Date(now).toISOString(),
      },
      {
        id: "c1",
        type: "comment",
        content: "launch update soon",
        upvotes: 0,
        downvotes: 0,
        replyCount: 0,
        createdAt: new Date(now + 5000).toISOString(),
      },
      {
        id: "c2",
        type: "comment",
        content: "launch update soon now",
        upvotes: 0,
        downvotes: 0,
        replyCount: 0,
        createdAt: new Date(now + 9000).toISOString(),
      },
    ];
  },
  async fetchThreadParticipants() {
    return [];
  },
};

registerSweepTool(fakeSweepServer, () => sweepAdapter, new ScoreCache());

const sweepResponse = await sweepHandler({ threadId: "demo-thread-xyz" });
const sweepPayload = parseJsonFromContent(sweepResponse.content);

assert(sweepResponse.isError !== true, "Sweep succeeds with content-only fallback");
assert(sweepPayload && sweepPayload.participantCount === 0, "Participant count is 0 when profiles are unavailable");
assert(
  sweepPayload &&
    Array.isArray(sweepPayload.notes) &&
    sweepPayload.notes.some((n) => n.includes("content-only coordination analysis")),
  "Fallback note is included in output"
);
assert(
  sweepPayload && sweepPayload.threatLevel === "SUSPICIOUS",
  "Threat level still computed from thread patterns"
);

// ═════════════════════════════════════════════════════════════════════
// 6. sweep enforce mode blocks risky threads
// ═════════════════════════════════════════════════════════════════════

section("6. sweep Enforce Mode");

const oldSweepEnforce = process.env.AGENTSCORE_ENFORCE;
const oldSweepThreats = process.env.AGENTSCORE_POLICY_BLOCK_THREAT_LEVELS;

process.env.AGENTSCORE_ENFORCE = "true";
process.env.AGENTSCORE_POLICY_BLOCK_THREAT_LEVELS = "SUSPICIOUS,COMPROMISED";

const blockedSweepResponse = await sweepHandler({ threadId: "demo-thread-xyz" });
const blockedSweepPayload = parseJsonFromContent(blockedSweepResponse.content);

assert(blockedSweepResponse.isError === true, "Enforce mode blocks risky sweep requests");
assert(
  blockedSweepResponse.content[0].text.includes("Policy gate blocked this thread sweep."),
  "Blocked sweep response includes policy gate message"
);
assert(
  blockedSweepPayload?.policyGate?.blocked === true,
  "Blocked sweep output includes policyGate.blocked=true"
);
assert(
  blockedSweepPayload?.policyGate?.reasons?.some((reason) => reason.includes("Threat level")),
  "Blocked sweep output includes threat-level reason"
);

if (oldSweepEnforce === undefined) delete process.env.AGENTSCORE_ENFORCE;
else process.env.AGENTSCORE_ENFORCE = oldSweepEnforce;
if (oldSweepThreats === undefined) delete process.env.AGENTSCORE_POLICY_BLOCK_THREAT_LEVELS;
else process.env.AGENTSCORE_POLICY_BLOCK_THREAT_LEVELS = oldSweepThreats;

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

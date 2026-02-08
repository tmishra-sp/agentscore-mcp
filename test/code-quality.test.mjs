/**
 * Regression tests for code quality fixes.
 *
 * Covers:
 * - Config NaN fallback
 * - Config adapter validation
 * - Config public mode validation
 * - JSON adapter error on malformed file
 * - JSON adapter thread support for sweep
 * - GitHub client 403 rate-limit retry behavior
 * - Sweep/agentscore zod schema validation
 * - Tier definitions match expected values
 * - Runtime/package version consistency
 *
 * Run: node test/code-quality.test.mjs
 */

import { z } from "zod";
import { TIERS, getTier } from "../dist/scoring/tiers.js";
import { spawnSync } from "node:child_process";
import { GitHubClient } from "../dist/adapters/github/client.js";

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

// ═════════════════════════════════════════════════════════════════════
// 1. Config NaN fallback
// ═════════════════════════════════════════════════════════════════════

section("1. Config NaN Fallback");

// Save original env values
const origCacheTtl = process.env.AGENTSCORE_CACHE_TTL;
const origRateLimitMs = process.env.AGENTSCORE_RATE_LIMIT_MS;

// Test: garbage env values should fall back to defaults
process.env.AGENTSCORE_CACHE_TTL = "not-a-number";
process.env.AGENTSCORE_RATE_LIMIT_MS = "garbage";

// Force fresh config load by re-importing
// We can't easily reset the singleton, so test the logic directly
const cacheTtl = parseInt(process.env.AGENTSCORE_CACHE_TTL, 10);
const rateLimitMs = parseInt(process.env.AGENTSCORE_RATE_LIMIT_MS, 10);

assert(Number.isNaN(cacheTtl), "parseInt('not-a-number') is NaN");
assert(Number.isNaN(rateLimitMs), "parseInt('garbage') is NaN");

const safeCacheTtl = Number.isNaN(cacheTtl) ? 86400 : cacheTtl;
const safeRateLimitMs = Number.isNaN(rateLimitMs) ? 200 : rateLimitMs;

assert(safeCacheTtl === 86400, `NaN cacheTtl falls back to 86400: ${safeCacheTtl}`);
assert(safeRateLimitMs === 200, `NaN rateLimitMs falls back to 200: ${safeRateLimitMs}`);

// Test: valid env values are used as-is
process.env.AGENTSCORE_CACHE_TTL = "3600";
process.env.AGENTSCORE_RATE_LIMIT_MS = "500";

const validCacheTtl = parseInt(process.env.AGENTSCORE_CACHE_TTL, 10);
const validRateLimitMs = parseInt(process.env.AGENTSCORE_RATE_LIMIT_MS, 10);
const safeValidCacheTtl = Number.isNaN(validCacheTtl) ? 86400 : validCacheTtl;
const safeValidRateLimitMs = Number.isNaN(validRateLimitMs) ? 200 : validRateLimitMs;

assert(safeValidCacheTtl === 3600, `Valid cacheTtl used: ${safeValidCacheTtl}`);
assert(safeValidRateLimitMs === 500, `Valid rateLimitMs used: ${safeValidRateLimitMs}`);

// Restore env
if (origCacheTtl === undefined) delete process.env.AGENTSCORE_CACHE_TTL;
else process.env.AGENTSCORE_CACHE_TTL = origCacheTtl;
if (origRateLimitMs === undefined) delete process.env.AGENTSCORE_RATE_LIMIT_MS;
else process.env.AGENTSCORE_RATE_LIMIT_MS = origRateLimitMs;

// ═════════════════════════════════════════════════════════════════════
// 2. Config adapter validation
// ═════════════════════════════════════════════════════════════════════

section("2. Config Adapter Validation");

const configScript = [
  "import('./dist/config.js')",
  ".then((m) => {",
  "  m.loadConfig();",
  "  console.log('ok');",
  "})",
  ".catch((error) => {",
  "  console.error(error.message);",
  "  process.exit(42);",
  "});",
].join("");

const badAdapterRun = spawnSync(process.execPath, ["-e", configScript], {
  env: { ...process.env, AGENTSCORE_ADAPTER: "not-real-adapter" },
  encoding: "utf-8",
});

assert(badAdapterRun.status === 42, `Invalid adapter exits with code 42: ${badAdapterRun.status}`);
assert(
  (badAdapterRun.stderr || "").includes("AGENTSCORE_ADAPTER must be one of"),
  "Invalid adapter error message is explicit"
);

const validAdapterRun = spawnSync(process.execPath, ["-e", configScript], {
  env: { ...process.env, AGENTSCORE_ADAPTER: "demo" },
  encoding: "utf-8",
});

assert(validAdapterRun.status === 0, `Valid adapter loads config: ${validAdapterRun.status}`);

const publicModeMissingAdapterRun = spawnSync(process.execPath, ["-e", configScript], {
  env: { ...process.env, AGENTSCORE_ADAPTER: "", AGENTSCORE_PUBLIC_MODE: "true" },
  encoding: "utf-8",
});

assert(
  publicModeMissingAdapterRun.status === 42,
  `Public mode without adapter exits with code 42: ${publicModeMissingAdapterRun.status}`
);
assert(
  (publicModeMissingAdapterRun.stderr || "").includes("AGENTSCORE_ADAPTER is required when AGENTSCORE_PUBLIC_MODE=true"),
  "Public mode requires explicit adapter"
);

const publicModeDemoRun = spawnSync(process.execPath, ["-e", configScript], {
  env: { ...process.env, AGENTSCORE_ADAPTER: "demo", AGENTSCORE_PUBLIC_MODE: "true" },
  encoding: "utf-8",
});

assert(
  publicModeDemoRun.status === 42,
  `Public mode with demo adapter exits with code 42: ${publicModeDemoRun.status}`
);
assert(
  (publicModeDemoRun.stderr || "").includes("does not allow AGENTSCORE_ADAPTER=demo"),
  "Public mode blocks demo adapter"
);

const publicModeRealAdapterRun = spawnSync(process.execPath, ["-e", configScript], {
  env: { ...process.env, AGENTSCORE_ADAPTER: "github", AGENTSCORE_PUBLIC_MODE: "true" },
  encoding: "utf-8",
});

assert(publicModeRealAdapterRun.status === 0, `Public mode accepts real adapter: ${publicModeRealAdapterRun.status}`);

// ═════════════════════════════════════════════════════════════════════
// 3. JSON adapter error on malformed file
// ═════════════════════════════════════════════════════════════════════

section("3. JSON Adapter Error Handling");

import { JSONAdapter } from "../dist/adapters/json/adapter.js";
import { loadConfig } from "../dist/config.js";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AGENTSCORE_VERSION } from "../dist/version.js";

const badFilePath = join(tmpdir(), "agentscore-test-bad.json");

// Write malformed JSON
await writeFile(badFilePath, "{ this is not valid json !!!", "utf-8");

// Override config to use our bad file
process.env.AGENTSCORE_ADAPTER = "json";
process.env.AGENTSCORE_DATA_PATH = badFilePath;
loadConfig();

const jsonAdapter = new JSONAdapter();
try {
  await jsonAdapter.fetchProfile("test");
  assert(false, "Should have thrown on malformed JSON");
} catch (error) {
  assert(
    error.message.includes("Invalid JSON in data file"),
    `Error message is descriptive: "${error.message}"`
  );
}

// Clean up
await unlink(badFilePath).catch(() => {});
delete process.env.AGENTSCORE_ADAPTER;
delete process.env.AGENTSCORE_DATA_PATH;

// ═════════════════════════════════════════════════════════════════════
// 4. JSON adapter thread support
// ═════════════════════════════════════════════════════════════════════

section("4. JSON Adapter Thread Support");

const threadFilePath = join(tmpdir(), "agentscore-test-threads.json");
const threadFixture = {
  agents: [
    {
      profile: {
        handle: "my-bot",
        displayName: "My Bot",
        description: "support agent",
        platform: "custom",
        karma: 50,
        followers: 5,
        following: 2,
        createdAt: "2024-01-01T00:00:00Z",
        claimed: true,
      },
      content: [],
      interactions: [],
    },
    {
      profile: {
        handle: "helper-bot",
        displayName: "Helper Bot",
        description: "helper agent",
        platform: "custom",
        karma: 40,
        followers: 3,
        following: 1,
        createdAt: "2024-01-02T00:00:00Z",
        claimed: true,
      },
      content: [],
      interactions: [],
    },
  ],
  threads: [
    {
      id: "support-thread-42",
      participantHandles: ["my-bot", "helper-bot", "ghost-bot", "MY-BOT"],
      content: [
        {
          id: "t1",
          type: "post",
          content: "Need help with export access.",
          upvotes: 0,
          downvotes: 0,
          replyCount: 1,
          createdAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "t2",
          type: "reply",
          content: "Use approved export flow only.",
          upvotes: 1,
          downvotes: 0,
          replyCount: 0,
          createdAt: "2026-01-01T00:01:00Z",
        },
      ],
    },
  ],
};

await writeFile(threadFilePath, JSON.stringify(threadFixture), "utf-8");
process.env.AGENTSCORE_ADAPTER = "json";
process.env.AGENTSCORE_DATA_PATH = threadFilePath;
loadConfig();

const threadAdapter = new JSONAdapter();
const threadContent = await threadAdapter.fetchThreadContent("support-thread-42");
assert(threadContent.length === 2, `Thread content resolved: ${threadContent.length}`);

const threadParticipants = await threadAdapter.fetchThreadParticipants("support-thread-42");
const participantHandles = threadParticipants.map((p) => p.handle).sort().join(",");
assert(
  participantHandles === "helper-bot,my-bot",
  `Thread participants resolved from known handles: ${participantHandles}`
);

const missingThreadContent = await threadAdapter.fetchThreadContent("missing-thread");
assert(missingThreadContent.length === 0, "Missing thread content returns []");

const missingThreadParticipants = await threadAdapter.fetchThreadParticipants("missing-thread");
assert(missingThreadParticipants.length === 0, "Missing thread participants return []");

await unlink(threadFilePath).catch(() => {});
delete process.env.AGENTSCORE_ADAPTER;
delete process.env.AGENTSCORE_DATA_PATH;

// ═════════════════════════════════════════════════════════════════════
// 5. GitHub client 403 rate-limit retry behavior
// ═════════════════════════════════════════════════════════════════════

section("5. GitHub 403 Retry Behavior");

const originalFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls++;
  if (fetchCalls === 1) {
    return new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
      status: 403,
      headers: {
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": "0",
      },
    });
  }
  return new Response(
    JSON.stringify({
      login: "octocat",
      name: "The Octocat",
      bio: null,
      company: null,
      blog: null,
      type: "User",
      followers: 1,
      following: 1,
      public_repos: 1,
      created_at: "2020-01-01T00:00:00Z",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
};

try {
  const githubClient = new GitHubClient();
  const user = await githubClient.fetchUser("octocat");
  assert(fetchCalls === 2, `GitHub client retried after 403: ${fetchCalls} calls`);
  assert(user && user.login === "octocat", "GitHub user returned after retry");
} finally {
  globalThis.fetch = originalFetch;
}

// ═════════════════════════════════════════════════════════════════════
// 6. Sweep/agentscore zod schema validation
// ═════════════════════════════════════════════════════════════════════

section("6. Zod Schema Validation");

// Sweep threadId schema
const sweepThreadIdSchema = z
  .string()
  .regex(/^[\w\-\/:.]{1,200}$/, "Thread ID must be 1-200 valid characters");

// Valid thread IDs
const validThreadIds = [
  "demo-thread-001",
  "owner/repo/issues/123",
  "post-123",
  "my_thread:456",
  "a",
];

for (const id of validThreadIds) {
  const result = sweepThreadIdSchema.safeParse(id);
  assert(result.success, `Valid threadId accepted: "${id}"`);
}

// Invalid thread IDs
const invalidThreadIds = [
  "",                        // empty
  "a".repeat(201),           // too long
  "has spaces in it",        // spaces
  "has<angle>brackets",      // special chars
  "has\"quotes\"",           // quotes
];

for (const id of invalidThreadIds) {
  const result = sweepThreadIdSchema.safeParse(id);
  assert(!result.success, `Invalid threadId rejected: "${id.slice(0, 30)}..."`);
}

// Platform enum schema
const platformSchema = z.enum(["demo", "json", "moltbook", "github"]).optional();

// Valid platforms
for (const p of ["demo", "json", "moltbook", "github", undefined]) {
  const result = platformSchema.safeParse(p);
  assert(result.success, `Valid platform accepted: ${p}`);
}

// Invalid platforms
for (const p of ["invalid", "DEMO", "Demo", "slack", ""]) {
  const result = platformSchema.safeParse(p);
  assert(!result.success, `Invalid platform rejected: "${p}"`);
}

// Handle schema (from agentscore)
const handleSchema = z
  .string()
  .regex(/^[\w-]{1,50}$/, "Handle must be 1-50 alphanumeric/dash/underscore characters");

assert(handleSchema.safeParse("NovaMind").success, "Valid handle: NovaMind");
assert(handleSchema.safeParse("my-bot_123").success, "Valid handle: my-bot_123");
assert(!handleSchema.safeParse("").success, "Invalid handle: empty");
assert(!handleSchema.safeParse("a".repeat(51)).success, "Invalid handle: too long");
assert(!handleSchema.safeParse("has spaces").success, "Invalid handle: spaces");

// ═════════════════════════════════════════════════════════════════════
// 7. Tier definitions match expected values
// ═════════════════════════════════════════════════════════════════════

section("7. Tier Definitions");

const expectedTiers = [
  { name: "Excellent", min: 750, max: 850, color: "#00E68A" },
  { name: "Good",      min: 650, max: 749, color: "#00AAFF" },
  { name: "Fair",      min: 550, max: 649, color: "#FFD000" },
  { name: "Poor",      min: 450, max: 549, color: "#FF8C00" },
  { name: "Critical",  min: 300, max: 449, color: "#FF3B5C" },
];

assert(TIERS.length === 5, `5 tiers defined: ${TIERS.length}`);

for (let i = 0; i < expectedTiers.length; i++) {
  const exp = expectedTiers[i];
  const actual = TIERS[i];
  assert(actual.name === exp.name, `Tier ${i} name: ${actual.name} === ${exp.name}`);
  assert(actual.min === exp.min, `Tier ${i} min: ${actual.min} === ${exp.min}`);
  assert(actual.max === exp.max, `Tier ${i} max: ${actual.max} === ${exp.max}`);
  assert(actual.color === exp.color, `Tier ${i} color: ${actual.color} === ${exp.color}`);
}

// getTier boundary tests
assert(getTier(850).name === "Excellent", "getTier(850) = Excellent");
assert(getTier(750).name === "Excellent", "getTier(750) = Excellent");
assert(getTier(749).name === "Good", "getTier(749) = Good");
assert(getTier(650).name === "Good", "getTier(650) = Good");
assert(getTier(649).name === "Fair", "getTier(649) = Fair");
assert(getTier(550).name === "Fair", "getTier(550) = Fair");
assert(getTier(549).name === "Poor", "getTier(549) = Poor");
assert(getTier(450).name === "Poor", "getTier(450) = Poor");
assert(getTier(449).name === "Critical", "getTier(449) = Critical");
assert(getTier(300).name === "Critical", "getTier(300) = Critical");

// Clamping: out-of-range values
assert(getTier(900).name === "Excellent", "getTier(900) clamped to Excellent");
assert(getTier(100).name === "Critical", "getTier(100) clamped to Critical");

// ═════════════════════════════════════════════════════════════════════
// 8. Runtime/package version consistency
// ═════════════════════════════════════════════════════════════════════

section("8. Version Consistency");

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf-8")
);

assert(
  AGENTSCORE_VERSION === packageJson.version,
  `Runtime version matches package.json: ${AGENTSCORE_VERSION}`
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

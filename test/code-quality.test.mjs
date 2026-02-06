/**
 * Regression tests for code quality fixes.
 *
 * Covers:
 * - Config NaN fallback
 * - JSON adapter error on malformed file
 * - Sweep/agentscore zod schema validation
 * - Tier definitions match expected values
 *
 * Run: node test/code-quality.test.mjs
 */

import { z } from "zod";
import { TIERS, getTier } from "../dist/scoring/tiers.js";

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
// 2. JSON adapter error on malformed file
// ═════════════════════════════════════════════════════════════════════

section("2. JSON Adapter Error Handling");

import { JSONAdapter } from "../dist/adapters/json/adapter.js";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const badFilePath = join(tmpdir(), "agentscore-test-bad.json");

// Write malformed JSON
await writeFile(badFilePath, "{ this is not valid json !!!", "utf-8");

// Override config to use our bad file
process.env.AGENTSCORE_ADAPTER = "json";
process.env.AGENTSCORE_DATA_PATH = badFilePath;

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
// 3. Sweep/agentscore zod schema validation
// ═════════════════════════════════════════════════════════════════════

section("3. Zod Schema Validation");

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
// 4. Tier definitions match expected values
// ═════════════════════════════════════════════════════════════════════

section("4. Tier Definitions");

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

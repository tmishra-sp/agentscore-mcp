/**
 * Public contract regression tests.
 *
 * Covers:
 * - README install/npm links align with package name
 * - reportUrl format matches live public site route shape
 *
 * Run: node test/public-contract.test.mjs
 */

import { readFile } from "node:fs/promises";
import { DemoAdapter } from "../dist/adapters/demo/adapter.js";
import { scoreAgent } from "../dist/scoring/engine.js";
import { loadConfig } from "../dist/config.js";

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

section("1. README Install and npm Link Contract");

const [readme, packageJsonRaw] = await Promise.all([
  readFile(new URL("../README.md", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);

const pkg = JSON.parse(packageJsonRaw);
const packageName = pkg.name;

const installMatches = [...readme.matchAll(/npx -y ([\w@./-]+)/g)];
assert(installMatches.length >= 1, "README contains npx install command");
const agentScoreInstallMatches = installMatches.filter((m) => m[1] === packageName);
assert(
  agentScoreInstallMatches.length >= 1,
  `README includes install command using package name (${packageName})`
);

assert(
  readme.includes(`https://npmjs.com/package/${packageName}`),
  "README npm package URL matches package name"
);
assert(
  readme.includes(`https://img.shields.io/npm/v/${packageName}?color=00E68A&label=npm`),
  "README npm badge URL matches package name"
);

section("2. reportUrl Route Contract");

const envBackup = {
  AGENTSCORE_ADAPTER: process.env.AGENTSCORE_ADAPTER,
  AGENTSCORE_PUBLIC_MODE: process.env.AGENTSCORE_PUBLIC_MODE,
  AGENTSCORE_SITE_URL: process.env.AGENTSCORE_SITE_URL,
  AGENTSCORE_REPORT_URL_MODE: process.env.AGENTSCORE_REPORT_URL_MODE,
};

process.env.AGENTSCORE_ADAPTER = "demo";
process.env.AGENTSCORE_PUBLIC_MODE = "false";
process.env.AGENTSCORE_SITE_URL = "https://ai-agent-score.vercel.app/";
process.env.AGENTSCORE_REPORT_URL_MODE = "demo-only";
loadConfig();

const adapter = new DemoAdapter();
const profile = await adapter.fetchProfile("NovaMind");
if (!profile) {
  assert(false, "Demo profile NovaMind resolved");
} else {
  const [content, interactions] = await Promise.all([
    adapter.fetchContent(profile.handle),
    adapter.fetchInteractions ? adapter.fetchInteractions(profile.handle) : Promise.resolve([]),
  ]);
  const result = scoreAgent(profile, content, interactions);

  assert(
    result.reportUrl === "https://ai-agent-score.vercel.app/agent/NovaMind",
    `reportUrl uses handle route: ${result.reportUrl}`
  );
  assert(!result.reportUrl.includes("/demo/"), "reportUrl no longer includes platform segment");
}

section("3. reportUrl Availability Policy Contract");

const enterpriseProfile = {
  handle: "claims-assist-v3",
  displayName: "ClaimsAssist v3",
  description: "Enterprise claims assistant",
  platform: "enterprise-internal",
  karma: 120,
  followers: 25,
  following: 10,
  createdAt: "2025-01-15T00:00:00Z",
  claimed: true,
};

process.env.AGENTSCORE_REPORT_URL_MODE = "demo-only";
loadConfig();
const nonDemoResult = scoreAgent(enterpriseProfile, [], []);
assert(nonDemoResult.reportUrl === undefined, "reportUrl suppressed for non-demo by default");
assert(
  nonDemoResult.badge.url.startsWith("https://img.shields.io/badge/"),
  "badge.url is plain URL"
);
assert(
  nonDemoResult.badge.markdown === `![AgentScore](${nonDemoResult.badge.url})`,
  "badge.markdown wraps badge.url"
);

process.env.AGENTSCORE_REPORT_URL_MODE = "always";
loadConfig();
const forcedReportResult = scoreAgent(enterpriseProfile, [], []);
assert(
  forcedReportResult.reportUrl === "https://ai-agent-score.vercel.app/agent/claims-assist-v3",
  "reportUrl can be forced for non-demo with AGENTSCORE_REPORT_URL_MODE=always"
);

if (envBackup.AGENTSCORE_ADAPTER === undefined) delete process.env.AGENTSCORE_ADAPTER;
else process.env.AGENTSCORE_ADAPTER = envBackup.AGENTSCORE_ADAPTER;
if (envBackup.AGENTSCORE_PUBLIC_MODE === undefined) delete process.env.AGENTSCORE_PUBLIC_MODE;
else process.env.AGENTSCORE_PUBLIC_MODE = envBackup.AGENTSCORE_PUBLIC_MODE;
if (envBackup.AGENTSCORE_SITE_URL === undefined) delete process.env.AGENTSCORE_SITE_URL;
else process.env.AGENTSCORE_SITE_URL = envBackup.AGENTSCORE_SITE_URL;
if (envBackup.AGENTSCORE_REPORT_URL_MODE === undefined) delete process.env.AGENTSCORE_REPORT_URL_MODE;
else process.env.AGENTSCORE_REPORT_URL_MODE = envBackup.AGENTSCORE_REPORT_URL_MODE;

section("Results");
console.log(`\n  ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

if (failed > 0) {
  console.error("  Some tests failed. Review output above.");
  process.exit(1);
} else {
  console.log("  All tests passed!\n");
}

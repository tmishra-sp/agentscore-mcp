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
};

process.env.AGENTSCORE_ADAPTER = "demo";
process.env.AGENTSCORE_PUBLIC_MODE = "false";
process.env.AGENTSCORE_SITE_URL = "https://ai-agent-score.vercel.app/";
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

if (envBackup.AGENTSCORE_ADAPTER === undefined) delete process.env.AGENTSCORE_ADAPTER;
else process.env.AGENTSCORE_ADAPTER = envBackup.AGENTSCORE_ADAPTER;
if (envBackup.AGENTSCORE_PUBLIC_MODE === undefined) delete process.env.AGENTSCORE_PUBLIC_MODE;
else process.env.AGENTSCORE_PUBLIC_MODE = envBackup.AGENTSCORE_PUBLIC_MODE;
if (envBackup.AGENTSCORE_SITE_URL === undefined) delete process.env.AGENTSCORE_SITE_URL;
else process.env.AGENTSCORE_SITE_URL = envBackup.AGENTSCORE_SITE_URL;

section("Results");
console.log(`\n  ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

if (failed > 0) {
  console.error("  Some tests failed. Review output above.");
  process.exit(1);
} else {
  console.log("  All tests passed!\n");
}

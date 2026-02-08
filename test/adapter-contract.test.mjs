/**
 * Adapter contract regression tests.
 *
 * Covers:
 * - GitHub client retries on 429 and 503 outage responses
 * - Moltbook client retries on 429 and handles network outages
 * - Moltbook adapter participant extraction from thread author metadata
 *
 * Run: node test/adapter-contract.test.mjs
 */

import { GitHubClient } from "../dist/adapters/github/client.js";
import { MoltbookClient } from "../dist/adapters/moltbook/client.js";
import { MoltbookAdapter } from "../dist/adapters/moltbook/adapter.js";

process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
process.env.MOLTBOOK_API_KEY = process.env.MOLTBOOK_API_KEY || "test-api-key";
process.env.AGENTSCORE_RATE_LIMIT_MS = "0";

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

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...args) => {
  if (typeof fn === "function") fn(...args);
  return 0;
};

try {
  // ═════════════════════════════════════════════════════════════════════
  // 1. GitHub client: 429 retry contract
  // ═════════════════════════════════════════════════════════════════════
  section("1. GitHub 429 Retry Contract");

  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls++;
    if (fetchCalls === 1) {
      return new Response(JSON.stringify({ message: "rate limit" }), {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": "0",
          "Retry-After": "0",
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
        followers: 5,
        following: 2,
        public_repos: 10,
        created_at: "2020-01-01T00:00:00Z",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const githubClient = new GitHubClient();
  const userAfter429 = await githubClient.fetchUser("octocat");
  assert(fetchCalls === 2, `GitHub retried once after 429: ${fetchCalls} calls`);
  assert(userAfter429 && userAfter429.login === "octocat", "GitHub 429 retry returns parsed user");

  // ═════════════════════════════════════════════════════════════════════
  // 2. GitHub client: persistent 503 outage contract
  // ═════════════════════════════════════════════════════════════════════
  section("2. GitHub 503 Outage Contract");

  fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls++;
    return new Response(JSON.stringify({ message: "service unavailable" }), {
      status: 503,
      headers: {
        "Content-Type": "application/json",
      },
    });
  };

  const githubOutageClient = new GitHubClient();
  const userDuringOutage = await githubOutageClient.fetchUser("octocat-outage");
  assert(fetchCalls === 4, `GitHub 503 path exhausts retries: ${fetchCalls} calls`);
  assert(userDuringOutage === null, "GitHub 503 outage returns null without throwing");

  // ═════════════════════════════════════════════════════════════════════
  // 3. Moltbook client: 429 retry contract
  // ═════════════════════════════════════════════════════════════════════
  section("3. Moltbook 429 Retry Contract");

  fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls++;
    if (fetchCalls === 1) {
      return new Response(JSON.stringify({ message: "rate limit" }), {
        status: 429,
        headers: {
          "Retry-After": "0",
        },
      });
    }
    return new Response(
      JSON.stringify({
        agent: {
          name: "AlphaBot",
          displayName: "Alpha Bot",
          description: "test",
          karma: 100,
          followers: 10,
          following: 2,
          createdAt: "2024-01-01T00:00:00Z",
          claimed: true,
        },
        recentPosts: [],
        recentComments: [],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const moltbookClient = new MoltbookClient();
  const agentAfter429 = await moltbookClient.fetchAgent("AlphaBot");
  assert(fetchCalls === 2, `Moltbook retried once after 429: ${fetchCalls} calls`);
  assert(agentAfter429 && agentAfter429.agent.name === "AlphaBot", "Moltbook 429 retry returns parsed agent");

  // ═════════════════════════════════════════════════════════════════════
  // 4. Moltbook client: network outage contract
  // ═════════════════════════════════════════════════════════════════════
  section("4. Moltbook Network Outage Contract");

  fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error("network down");
  };

  const agentDuringOutage = await moltbookClient.fetchAgent("AlphaBot");
  assert(fetchCalls === 4, `Moltbook network outage exhausts retries: ${fetchCalls} calls`);
  assert(agentDuringOutage === null, "Moltbook network outage returns null without throwing");

  // ═════════════════════════════════════════════════════════════════════
  // 5. Moltbook adapter: participant extraction contract
  // ═════════════════════════════════════════════════════════════════════
  section("5. Moltbook Participant Extraction Contract");

  const adapter = new MoltbookAdapter();
  adapter.client = {
    async fetchThread() {
      return {
        post: {
          _id: "p1",
          content: "root post",
          upvotes: 1,
          downvotes: 0,
          commentCount: 3,
          createdAt: "2025-01-01T00:00:00Z",
          author: { name: "alice" },
        },
        comments: [
          {
            _id: "c1",
            content: "first reply",
            upvotes: 1,
            downvotes: 0,
            createdAt: "2025-01-01T00:01:00Z",
            author: { username: "bob" },
          },
          {
            _id: "c2",
            content: "duplicate author",
            upvotes: 0,
            downvotes: 0,
            createdAt: "2025-01-01T00:02:00Z",
            author: { name: "alice" },
          },
          {
            _id: "c3",
            content: "unknown author",
            upvotes: 0,
            downvotes: 0,
            createdAt: "2025-01-01T00:03:00Z",
          },
        ],
      };
    },
  };
  adapter.fetchProfile = async (handle) => ({
    handle,
    displayName: handle,
    description: "profile",
    platform: "moltbook",
    karma: 10,
    followers: 1,
    following: 1,
    createdAt: "2024-01-01T00:00:00Z",
    claimed: true,
  });

  const participants = await adapter.fetchThreadParticipants("thread-1");
  const handles = participants.map((p) => p.handle).sort();
  assert(participants.length === 2, `Extracted unique participants: ${participants.length}`);
  assert(handles.join(",") === "alice,bob", `Participant handles resolved from author data: ${handles.join(",")}`);
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
}

section("Results");
console.log(`\n  ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

if (failed > 0) {
  console.error("  Some tests failed. Review output above.");
  process.exit(1);
} else {
  console.log("  All tests passed!\n");
}

#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { AgentPlatformAdapter } from "./adapters/types.js";
import { DemoAdapter } from "./adapters/demo/adapter.js";
import { MoltbookAdapter } from "./adapters/moltbook/adapter.js";
import { JSONAdapter } from "./adapters/json/adapter.js";
import { GitHubAdapter } from "./adapters/github/adapter.js";
import { ScoreCache } from "./cache/score-cache.js";
import { loadConfig } from "./config.js";
import { registerAgentScoreTool } from "./tools/agentscore.js";
import { registerSweepTool } from "./tools/sweep.js";
import { AGENTSCORE_VERSION } from "./version.js";

async function main() {
  const config = loadConfig();

  // Initialize adapter
  const adapters: Record<string, AgentPlatformAdapter> = {};

  if (config.adapter === "demo") {
    adapters.demo = new DemoAdapter();
    console.error("[agentscore] Using built-in demo agents — zero config required.");
    console.error("[agentscore] Try: investigate @NovaMind or sweep thread demo-thread-001.");
    console.error("[agentscore] Set AGENTSCORE_ADAPTER=json or =moltbook for real data.");
  } else if (config.adapter === "json") {
    adapters.json = new JSONAdapter();
    console.error("[agentscore] Using JSON adapter — data path:", config.dataPath);
  } else if (config.adapter === "github") {
    adapters.github = new GitHubAdapter();
    const mode = config.githubToken ? "authenticated — 5,000 req/hr" : "unauthenticated — 60 req/hr";
    console.error(`[agentscore] Using GitHub adapter (${mode})`);
  } else {
    adapters.moltbook = new MoltbookAdapter();
    console.error("[agentscore] Using Moltbook adapter");
  }

  function getAdapter(platform?: string): AgentPlatformAdapter {
    const name = platform || config.adapter;
    const adapter = adapters[name];
    if (!adapter) {
      // Lazily create adapter if requested by name
      if (name === "demo") {
        adapters.demo = new DemoAdapter();
        return adapters.demo;
      }
      if (name === "json") {
        adapters.json = new JSONAdapter();
        return adapters.json;
      }
      if (name === "moltbook") {
        adapters.moltbook = new MoltbookAdapter();
        return adapters.moltbook;
      }
      if (name === "github") {
        adapters.github = new GitHubAdapter();
        return adapters.github;
      }
      throw new Error(
        `Unknown adapter '${name}'. Available: demo, json, moltbook, github`
      );
    }
    return adapter;
  }

  // Initialize cache
  const cache = new ScoreCache(config.cacheTtl);

  // Create MCP server
  const server = new McpServer({
    name: "agentscore-mcp-server",
    version: AGENTSCORE_VERSION,
  });

  // Register tools
  registerAgentScoreTool(server, getAdapter, cache);
  registerSweepTool(server, getAdapter, cache);

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[agentscore] Server started — 2 tools registered (agentscore, sweep)");
  console.error("[agentscore] Adapter:", config.adapter);
  console.error("[agentscore] Public mode:", config.publicMode ? "enabled" : "disabled");
  console.error("[agentscore] Cache TTL:", config.cacheTtl, "seconds");
}

main().catch((error) => {
  console.error("[agentscore] Fatal error:", error);
  process.exit(1);
});

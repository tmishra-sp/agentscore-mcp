#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { AgentPlatformAdapter } from "./adapters/types.js";
import { DemoAdapter } from "./adapters/demo/adapter.js";
import { MoltbookAdapter } from "./adapters/moltbook/adapter.js";
import { JSONAdapter } from "./adapters/json/adapter.js";
import { GitHubAdapter } from "./adapters/github/adapter.js";
import { ScoreCache } from "./cache/score-cache.js";
import { loadConfig } from "./config.js";
import { registerAgentScoreTool } from "./tools/agentscore.js";
import { registerSweepTool } from "./tools/sweep.js";
import { getPolicyAuditStats, listPolicyAuditEvents, setAuditStoreMaxEntries } from "./security/audit-store.js";
import { readPolicyConfigFromEnv } from "./security/policy.js";
import { AGENTSCORE_VERSION } from "./version.js";

function buildAdapterResolver(config: ReturnType<typeof loadConfig>): (platform?: string) => AgentPlatformAdapter {
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

  return function getAdapter(platform?: string): AgentPlatformAdapter {
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
  };
}

function buildMcpServer(
  getAdapter: (platform?: string) => AgentPlatformAdapter,
  cache: ScoreCache,
  enabledTools: Array<"agentscore" | "sweep">
): McpServer {
  const server = new McpServer({
    name: "agentscore-mcp-server",
    version: AGENTSCORE_VERSION,
  });
  if (enabledTools.includes("agentscore")) {
    registerAgentScoreTool(server, getAdapter, cache);
  }
  if (enabledTools.includes("sweep")) {
    registerSweepTool(server, getAdapter, cache);
  }
  return server;
}

function isTokenAuthorized(
  req: { headers: Record<string, unknown> },
  expectedToken: string,
  alternateHeaders: string[] = []
): boolean {
  if (!expectedToken) return true;
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length) === expectedToken;
  }
  return alternateHeaders.some((headerName) => {
    const customHeader = req.headers[headerName];
    return typeof customHeader === "string" && customHeader === expectedToken;
  });
}

function writeUnauthorizedMcpResponse(res: { status: (code: number) => { json: (body: unknown) => void } }): void {
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized" },
    id: null,
  });
}

async function startStdioServer(
  config: ReturnType<typeof loadConfig>,
  getAdapter: (platform?: string) => AgentPlatformAdapter,
  cache: ScoreCache
): Promise<void> {
  const server = buildMcpServer(getAdapter, cache, config.enabledTools);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[agentscore] Server started — ${config.enabledTools.length} tool(s) registered (${config.enabledTools.join(", ")})`
  );
  console.error("[agentscore] Transport: stdio");
  console.error("[agentscore] Adapter:", config.adapter);
  console.error("[agentscore] Public mode:", config.publicMode ? "enabled" : "disabled");
  console.error("[agentscore] Cache TTL:", config.cacheTtl, "seconds");
}

async function startHttpServer(
  config: ReturnType<typeof loadConfig>,
  getAdapter: (platform?: string) => AgentPlatformAdapter,
  cache: ScoreCache
): Promise<void> {
  const app = createMcpExpressApp({ host: config.httpHost });
  const sessions: Record<string, { server: McpServer; transport: StreamableHTTPServerTransport }> = {};

  app.get("/healthz", (_req: any, res: any) => {
    res.json({
      ok: true,
      service: "agentscore-mcp-server",
      version: AGENTSCORE_VERSION,
      transport: "http",
      adapter: config.adapter,
      publicMode: config.publicMode,
    });
  });

  app.get("/agentscore/policy", (req: any, res: any) => {
    if (!isTokenAuthorized(req, config.auditToken, ["x-agentscore-audit-token"])) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const policy = readPolicyConfigFromEnv();
    res.json({
      enforce: policy.enforce,
      minScore: policy.minScore,
      blockedRecommendations: policy.blockedRecommendations,
      blockedThreatLevels: policy.blockedThreatLevels,
      blockedFlagPatterns: policy.blockedFlagPatterns,
      trustedAdapters: policy.trustedAdapters,
      failOnErrors: policy.failOnErrors,
      auditLog: policy.auditLog,
    });
  });

  app.get("/agentscore/audit", (req: any, res: any) => {
    if (!isTokenAuthorized(req, config.auditToken, ["x-agentscore-audit-token"])) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;
    const limit = Number.isNaN(limitRaw as number) ? undefined : limitRaw;
    const toolParam = typeof req.query.tool === "string" ? req.query.tool : undefined;
    const blockedParam =
      typeof req.query.blocked === "string" ? req.query.blocked.toLowerCase() : undefined;
    const blocked = blockedParam === "true" ? true : blockedParam === "false" ? false : undefined;

    const events = listPolicyAuditEvents({
      limit,
      tool: toolParam === "agentscore" || toolParam === "sweep" ? toolParam : undefined,
      blocked,
    });
    res.json({
      stats: getPolicyAuditStats(),
      count: events.length,
      events,
    });
  });

  app.post(config.httpPath, async (req: any, res: any) => {
    if (!isTokenAuthorized(req, config.httpAuthToken, ["x-agentscore-mcp-token", "x-agentscore-token"])) {
      writeUnauthorizedMcpResponse(res);
      return;
    }
    try {
      const sessionId = req.headers["mcp-session-id"];
      let session = typeof sessionId === "string" ? sessions[sessionId] : undefined;

      if (!session) {
        if (sessionId && !session) {
          res.status(404).json({
            jsonrpc: "2.0",
            error: { code: -32001, message: "Session not found." },
            id: null,
          });
          return;
        }

        if (!isInitializeRequest(req.body)) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "No valid session ID provided and request is not initialize." },
            id: null,
          });
          return;
        }

        const server = buildMcpServer(getAdapter, cache, config.enabledTools);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            sessions[newSessionId] = { server, transport };
          },
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      await session.transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("[agentscore] HTTP MCP POST error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get(config.httpPath, async (req: any, res: any) => {
    if (!isTokenAuthorized(req, config.httpAuthToken, ["x-agentscore-mcp-token", "x-agentscore-token"])) {
      writeUnauthorizedMcpResponse(res);
      return;
    }
    const sessionId = req.headers["mcp-session-id"];
    if (typeof sessionId !== "string" || !sessions[sessionId]) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: missing or invalid mcp-session-id" },
        id: null,
      });
      return;
    }
    await sessions[sessionId].transport.handleRequest(req, res);
  });

  app.delete(config.httpPath, async (req: any, res: any) => {
    if (!isTokenAuthorized(req, config.httpAuthToken, ["x-agentscore-mcp-token", "x-agentscore-token"])) {
      writeUnauthorizedMcpResponse(res);
      return;
    }
    const sessionId = req.headers["mcp-session-id"];
    if (typeof sessionId !== "string" || !sessions[sessionId]) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: missing or invalid mcp-session-id" },
        id: null,
      });
      return;
    }
    const session = sessions[sessionId];
    await session.transport.handleRequest(req, res);
    await session.transport.close();
    await session.server.close();
    delete sessions[sessionId];
  });

  const listener = app.listen(config.httpPort, config.httpHost, () => {
    console.error(
      `[agentscore] Server started — ${config.enabledTools.length} tool(s) registered (${config.enabledTools.join(", ")})`
    );
    console.error("[agentscore] Transport: streamable-http");
    console.error("[agentscore] MCP endpoint:", `http://${config.httpHost}:${config.httpPort}${config.httpPath}`);
    console.error("[agentscore] Audit endpoint:", `http://${config.httpHost}:${config.httpPort}/agentscore/audit`);
    console.error("[agentscore] Policy endpoint:", `http://${config.httpHost}:${config.httpPort}/agentscore/policy`);
    console.error("[agentscore] MCP endpoint auth:", config.httpAuthToken ? "enabled" : "disabled");
    console.error("[agentscore] Adapter:", config.adapter);
    console.error("[agentscore] Public mode:", config.publicMode ? "enabled" : "disabled");
    console.error("[agentscore] Cache TTL:", config.cacheTtl, "seconds");
  });

  const shutdown = async () => {
    for (const [sessionId, session] of Object.entries(sessions)) {
      await session.transport.close().catch(() => undefined);
      await session.server.close().catch(() => undefined);
      delete sessions[sessionId];
    }
    listener.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2_000).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main() {
  if (process.argv.includes("--enforce") && !process.env.AGENTSCORE_ENFORCE) {
    process.env.AGENTSCORE_ENFORCE = "true";
  }
  const config = loadConfig();
  setAuditStoreMaxEntries(config.auditMaxEntries);

  const getAdapter = buildAdapterResolver(config);

  // Initialize cache
  const cache = new ScoreCache(config.cacheTtl);

  if (config.transport === "http") {
    await startHttpServer(config, getAdapter, cache);
    return;
  }

  await startStdioServer(config, getAdapter, cache);
}

main().catch((error) => {
  console.error("[agentscore] Fatal error:", error);
  process.exit(1);
});

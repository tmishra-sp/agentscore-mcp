import path from "node:path";

export interface Config {
  adapter: "demo" | "moltbook" | "json" | "github";
  transport: "stdio" | "http";
  enabledTools: Array<"agentscore" | "sweep">;
  moltbookApiKey: string;
  githubToken: string;
  dataPath: string;
  cacheTtl: number;
  rateLimitMs: number;
  publicMode: boolean;
  httpHost: string;
  httpPort: number;
  httpPath: string;
  httpAuthToken: string;
  auditToken: string;
  auditMaxEntries: number;
}

let _config: Config | null = null;
const ADAPTERS: Config["adapter"][] = ["demo", "moltbook", "json", "github"];
const TRANSPORTS: Config["transport"][] = ["stdio", "http"];
const TOOLS: Config["enabledTools"] = ["agentscore", "sweep"];

/** Load and validate configuration from environment variables. */
export function loadConfig(): Config {
  const publicMode = (process.env.AGENTSCORE_PUBLIC_MODE || "").trim().toLowerCase() === "true";
  const rawTransport = (process.env.AGENTSCORE_TRANSPORT || "").trim();
  const resolvedTransport = rawTransport || "stdio";
  if (!TRANSPORTS.includes(resolvedTransport as Config["transport"])) {
    throw new Error(
      `AGENTSCORE_TRANSPORT must be one of: ${TRANSPORTS.join(", ")}. Received: "${resolvedTransport || "<empty>"}".`
    );
  }
  const transport = resolvedTransport as Config["transport"];
  const rawAdapter = (process.env.AGENTSCORE_ADAPTER || "").trim();
  const resolvedAdapter = rawAdapter || "demo";

  if (publicMode && !rawAdapter) {
    throw new Error(
      `AGENTSCORE_ADAPTER is required when AGENTSCORE_PUBLIC_MODE=true. Choose one of: ${ADAPTERS.join(", ")}.`
    );
  }

  if (!ADAPTERS.includes(resolvedAdapter as Config["adapter"])) {
    throw new Error(
      `AGENTSCORE_ADAPTER must be one of: ${ADAPTERS.join(", ")}. Received: "${resolvedAdapter || "<empty>"}".`
    );
  }
  const adapter = resolvedAdapter as Config["adapter"];

  if (publicMode && adapter === "demo") {
    throw new Error(
      "AGENTSCORE_PUBLIC_MODE=true does not allow AGENTSCORE_ADAPTER=demo. Use json, github, or moltbook."
    );
  }
  const dataPath = process.env.AGENTSCORE_DATA_PATH || "";

  if (dataPath) {
    // Normalize and check for '..' segments to prevent path traversal.
    // path.normalize resolves redundant separators and './.' but preserves '..',
    // so we can reliably detect traversal attempts in any form.
    const normalized = path.normalize(dataPath);
    if (normalized.split(path.sep).includes("..")) {
      throw new Error("AGENTSCORE_DATA_PATH must not contain '..' segments.");
    }
  }

  if (adapter === "moltbook" && !process.env.MOLTBOOK_API_KEY) {
    console.error(
      "[agentscore] MOLTBOOK_API_KEY required when using Moltbook adapter. " +
      "Get one at moltbook.com. Or try AGENTSCORE_ADAPTER=demo to explore with built-in sample agents."
    );
  }

  if (adapter === "github" && !process.env.GITHUB_TOKEN) {
    console.error(
      "[agentscore] GITHUB_TOKEN not set — running with 60 req/hour limit. " +
      "Set GITHUB_TOKEN for 5,000 req/hour."
    );
  }

  if (adapter === "json" && !dataPath) {
    throw new Error(
      "AGENTSCORE_DATA_PATH required when using JSON adapter. Point this to your agent data file."
    );
  }

  const cacheTtl = parseInt(process.env.AGENTSCORE_CACHE_TTL || "86400", 10);
  const rateLimitMs = parseInt(process.env.AGENTSCORE_RATE_LIMIT_MS || "200", 10);
  const httpHost = (process.env.AGENTSCORE_HTTP_HOST || "127.0.0.1").trim() || "127.0.0.1";
  const parsedHttpPort = parseInt(process.env.AGENTSCORE_HTTP_PORT || "8787", 10);
  const httpPort = Number.isNaN(parsedHttpPort) ? 8787 : Math.max(1, Math.min(parsedHttpPort, 65535));
  const rawHttpPath = (process.env.AGENTSCORE_HTTP_PATH || "/mcp").trim() || "/mcp";
  const httpPath = rawHttpPath.startsWith("/") ? rawHttpPath : `/${rawHttpPath}`;
  const parsedAuditMaxEntries = parseInt(process.env.AGENTSCORE_AUDIT_MAX_ENTRIES || "500", 10);
  const auditMaxEntries = Number.isNaN(parsedAuditMaxEntries)
    ? 500
    : Math.max(10, Math.min(parsedAuditMaxEntries, 10_000));
  const rawEnabledTools = (process.env.AGENTSCORE_ENABLED_TOOLS || "").trim().toLowerCase();
  let enabledTools: Config["enabledTools"] = [...TOOLS];
  if (rawEnabledTools) {
    const requestedTools = [...new Set(rawEnabledTools.split(",").map((item) => item.trim()).filter(Boolean))];
    const invalidTools = requestedTools.filter((tool) => !TOOLS.includes(tool as Config["enabledTools"][number]));
    if (invalidTools.length > 0) {
      throw new Error(
        `AGENTSCORE_ENABLED_TOOLS contains invalid tools: ${invalidTools.join(", ")}. ` +
        `Allowed values: ${TOOLS.join(", ")}.`
      );
    }
    enabledTools = TOOLS.filter((tool) => requestedTools.includes(tool));
    if (enabledTools.length === 0) {
      throw new Error(`AGENTSCORE_ENABLED_TOOLS must include at least one tool: ${TOOLS.join(", ")}.`);
    }
  }

  _config = {
    adapter,
    transport,
    enabledTools,
    moltbookApiKey: process.env.MOLTBOOK_API_KEY || "",
    githubToken: process.env.GITHUB_TOKEN || "",
    dataPath,
    cacheTtl: Number.isNaN(cacheTtl) ? 86400 : cacheTtl,
    rateLimitMs: Number.isNaN(rateLimitMs) ? 200 : rateLimitMs,
    publicMode,
    httpHost,
    httpPort,
    httpPath,
    httpAuthToken: process.env.AGENTSCORE_HTTP_AUTH_TOKEN || "",
    auditToken: process.env.AGENTSCORE_AUDIT_TOKEN || "",
    auditMaxEntries,
  };

  return _config;
}

/** Get the current config (must call loadConfig first). */
export function getConfig(): Config {
  if (!_config) {
    return loadConfig();
  }
  return _config;
}

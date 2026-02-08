import path from "node:path";

export interface Config {
  adapter: "demo" | "moltbook" | "json" | "github";
  moltbookApiKey: string;
  githubToken: string;
  dataPath: string;
  cacheTtl: number;
  rateLimitMs: number;
  siteUrl: string;
  publicMode: boolean;
}

let _config: Config | null = null;
const ADAPTERS: Config["adapter"][] = ["demo", "moltbook", "json", "github"];

/** Load and validate configuration from environment variables. */
export function loadConfig(): Config {
  const publicMode = (process.env.AGENTSCORE_PUBLIC_MODE || "").trim().toLowerCase() === "true";
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
  const rawSiteUrl = process.env.AGENTSCORE_SITE_URL || "https://ai-agent-score.vercel.app";

  if (dataPath) {
    // Normalize and check for '..' segments to prevent path traversal.
    // path.normalize resolves redundant separators and './.' but preserves '..',
    // so we can reliably detect traversal attempts in any form.
    const normalized = path.normalize(dataPath);
    if (normalized.split(path.sep).includes("..")) {
      throw new Error("AGENTSCORE_DATA_PATH must not contain '..' segments.");
    }
  }

  let siteUrl = rawSiteUrl.replace(/\/$/, "");
  try {
    const parsed = new URL(siteUrl);
    if (parsed.protocol !== "https:") {
      throw new Error("AGENTSCORE_SITE_URL must use https://");
    }
  } catch (error) {
    throw new Error("AGENTSCORE_SITE_URL must be a valid https:// URL.");
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

  _config = {
    adapter,
    moltbookApiKey: process.env.MOLTBOOK_API_KEY || "",
    githubToken: process.env.GITHUB_TOKEN || "",
    dataPath,
    cacheTtl: Number.isNaN(cacheTtl) ? 86400 : cacheTtl,
    rateLimitMs: Number.isNaN(rateLimitMs) ? 200 : rateLimitMs,
    siteUrl,
    publicMode,
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

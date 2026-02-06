export interface Config {
  adapter: "demo" | "moltbook" | "json" | "github";
  moltbookApiKey: string;
  githubToken: string;
  dataPath: string;
  cacheTtl: number;
  rateLimitMs: number;
  siteUrl: string;
}

let _config: Config | null = null;

/** Load and validate configuration from environment variables. */
export function loadConfig(): Config {
  const adapter = (process.env.AGENTSCORE_ADAPTER || "demo") as Config["adapter"];

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

  if (adapter === "json" && !process.env.AGENTSCORE_DATA_PATH) {
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
    dataPath: process.env.AGENTSCORE_DATA_PATH || "",
    cacheTtl: Number.isNaN(cacheTtl) ? 86400 : cacheTtl,
    rateLimitMs: Number.isNaN(rateLimitMs) ? 200 : rateLimitMs,
    siteUrl: (process.env.AGENTSCORE_SITE_URL || "https://agentscore.vercel.app").replace(/\/$/, ""),
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

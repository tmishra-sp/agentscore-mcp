import { z } from "zod";
import type {
  GitHubUser,
  GitHubRepo,
  GitHubSearchResult,
  GitHubEvent,
  GitHubIssue,
  GitHubComment,
  GitHubRateLimit,
  GitHubApp,
  CacheEntry,
} from "./types.js";
import { getConfig } from "../../config.js";

const GitHubUserSchema = z.object({
  login: z.string(),
  name: z.string().nullable(),
  bio: z.string().nullable(),
  company: z.string().nullable(),
  blog: z.string().nullable(),
  type: z.enum(["User", "Organization", "Bot"]),
  followers: z.number(),
  following: z.number(),
  public_repos: z.number(),
  created_at: z.string(),
});

const GitHubReactionsSchema = z.object({
  "+1": z.number(),
  "-1": z.number(),
  laugh: z.number(),
  hooray: z.number(),
  confused: z.number(),
  heart: z.number(),
  rocket: z.number(),
  eyes: z.number(),
});

const GitHubIssueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.string(),
  comments: z.number(),
  created_at: z.string(),
  user: z.object({ login: z.string(), type: z.string() }),
  reactions: GitHubReactionsSchema,
  html_url: z.string(),
});

const GitHubCommentSchema = z.object({
  id: z.number(),
  body: z.string(),
  created_at: z.string(),
  user: z.object({ login: z.string(), type: z.string() }),
  reactions: GitHubReactionsSchema,
});

const BASE_URL = "https://api.github.com";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 100;
const MAX_RETRIES = 3;

/** GitHub API client with retry, caching, and rate limit awareness. */
export class GitHubClient {
  private token: string;
  private cache = new Map<string, CacheEntry<unknown>>();

  constructor() {
    this.token = getConfig().githubToken;
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.token) {
      h.Authorization = `Bearer ${this.token}`;
    }
    return h;
  }

  private getCached<T>(url: string): T | undefined {
    const entry = this.cache.get(url);
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      this.cache.delete(url);
      return undefined;
    }
    return entry.data as T;
  }

  private setCache<T>(url: string, data: T): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(url, { data, cachedAt: Date.now() });
  }

  private async fetchWithRetry(url: string): Promise<Response> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, { headers: this.headers, signal: AbortSignal.timeout(15_000) });

        // Parse rate limit headers
        const remaining = parseInt(response.headers.get("X-RateLimit-Remaining") || "-1", 10);
        const resetTs = parseInt(response.headers.get("X-RateLimit-Reset") || "0", 10);
        if (remaining >= 0 && remaining < 10) {
          const resetDate = new Date(resetTs * 1000).toLocaleTimeString();
          console.error(`[agentscore] GitHub rate limit low: ${remaining} remaining, resets at ${resetDate}`);
        }

        // Handle rate limiting
        if (response.status === 429) {
          if (attempt < MAX_RETRIES) {
            const sleepMs = resetTs > 0
              ? Math.max((resetTs * 1000) - Date.now(), 1000)
              : Math.pow(2, attempt) * 1000;
            console.error(`[agentscore] GitHub 429 — sleeping ${Math.round(sleepMs / 1000)}s`);
            await new Promise((resolve) => setTimeout(resolve, sleepMs));
            continue;
          }
        }

        // Retry on server errors
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          const backoff = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }

        return response;
      } catch (error) {
        if (attempt === MAX_RETRIES) throw error;
        const backoff = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
    throw new Error("Max retries exceeded");
  }

  private async get<T>(url: string, schema?: z.ZodType<T>): Promise<T | null> {
    const cached = this.getCached<T>(url);
    if (cached !== undefined) return cached;

    try {
      const response = await this.fetchWithRetry(url);
      if (response.status === 404) return null;
      if (response.status === 422) return null; // Complex search queries can 422
      if (!response.ok) {
        console.error(`[agentscore] GitHub API error: ${response.status} for ${url}`);
        return null;
      }
      const json: unknown = await response.json();
      let data: T;
      if (schema) {
        const result = schema.safeParse(json);
        if (!result.success) {
          console.error(`[agentscore] GitHub response validation failed for ${url}:`, result.error.message);
          return null;
        }
        data = result.data;
      } else {
        data = json as T;
      }
      this.setCache(url, data);
      return data;
    } catch (error) {
      console.error(`[agentscore] GitHub fetch error for ${url}:`, error);
      return null;
    }
  }

  async fetchUser(username: string): Promise<GitHubUser | null> {
    return this.get<GitHubUser>(`${BASE_URL}/users/${encodeURIComponent(username)}`, GitHubUserSchema);
  }

  async fetchUserRepos(username: string): Promise<GitHubRepo[]> {
    const repos = await this.get<GitHubRepo[]>(
      `${BASE_URL}/users/${encodeURIComponent(username)}/repos?sort=stars&direction=desc&per_page=30`
    );
    return repos || [];
  }

  async searchIssues(query: string, limit = 30): Promise<GitHubSearchResult> {
    const perPage = Math.min(limit, 100);
    const result = await this.get<GitHubSearchResult>(
      `${BASE_URL}/search/issues?q=${encodeURIComponent(query)}&per_page=${perPage}&sort=created&order=desc`
    );
    return result || { total_count: 0, incomplete_results: false, items: [] };
  }

  async fetchUserEvents(username: string): Promise<GitHubEvent[]> {
    const events = await this.get<GitHubEvent[]>(
      `${BASE_URL}/users/${encodeURIComponent(username)}/events/public?per_page=100`
    );
    return events || [];
  }

  async fetchIssue(owner: string, repo: string, number: number): Promise<GitHubIssue | null> {
    return this.get<GitHubIssue>(
      `${BASE_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}`,
      GitHubIssueSchema,
    );
  }

  async fetchIssueComments(
    owner: string,
    repo: string,
    number: number,
    maxPages = 3,
  ): Promise<GitHubComment[]> {
    const allComments: GitHubComment[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const url =
        `${BASE_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        `/issues/${number}/comments?per_page=100&page=${page}`;
      const comments = await this.get<GitHubComment[]>(url, z.array(GitHubCommentSchema));
      if (!comments || comments.length === 0) break;
      allComments.push(...comments);
    }
    return allComments;
  }

  async fetchApp(slug: string): Promise<GitHubApp | null> {
    return this.get<GitHubApp>(`${BASE_URL}/apps/${encodeURIComponent(slug)}`);
  }

  async checkRateLimit(): Promise<GitHubRateLimit | null> {
    return this.get<GitHubRateLimit>(`${BASE_URL}/rate_limit`);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const limits = await this.checkRateLimit();
      if (!limits) return false;
      const threshold = this.token ? 20 : 5;
      return limits.resources.core.remaining >= threshold;
    } catch {
      return false;
    }
  }
}

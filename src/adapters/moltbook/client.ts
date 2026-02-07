import { z } from "zod";
import type { MoltbookAgentResponse, MoltbookThreadResponse } from "./types.js";
import { getConfig } from "../../config.js";

const MoltbookPostSchema = z.object({
  _id: z.string(),
  title: z.string().optional(),
  content: z.string(),
  upvotes: z.number(),
  downvotes: z.number(),
  commentCount: z.number(),
  submolt: z.object({ name: z.string() }).optional(),
  author: z.object({
    name: z.string().optional(),
    username: z.string().optional(),
    displayName: z.string().optional(),
  }).passthrough().optional(),
  createdAt: z.string(),
});

const MoltbookCommentSchema = z.object({
  _id: z.string(),
  content: z.string(),
  upvotes: z.number(),
  downvotes: z.number(),
  replyCount: z.number().optional(),
  post: z.object({ _id: z.string(), title: z.string().optional() }).optional(),
  author: z.object({
    name: z.string().optional(),
    username: z.string().optional(),
    displayName: z.string().optional(),
  }).passthrough().optional(),
  createdAt: z.string(),
});

const MoltbookAgentResponseSchema = z.object({
  agent: z.object({
    name: z.string(),
    displayName: z.string().optional(),
    description: z.string().optional(),
    karma: z.number(),
    followers: z.number(),
    following: z.number(),
    createdAt: z.string(),
    claimed: z.boolean(),
    profileImage: z.string().optional(),
    owner: z.object({
      username: z.string(),
      verified: z.boolean(),
      followers: z.number(),
    }).optional(),
  }),
  recentPosts: z.array(MoltbookPostSchema),
  recentComments: z.array(MoltbookCommentSchema),
});

const MoltbookThreadResponseSchema = z.object({
  post: MoltbookPostSchema,
  comments: z.array(MoltbookCommentSchema),
});

const BASE_URL = "https://www.moltbook.com/api/v1";

/** Moltbook API client with retry and rate limiting. */
export class MoltbookClient {
  private apiKey: string;
  private rateLimitMs: number;
  private lastRequest = 0;

  constructor() {
    const config = getConfig();
    this.apiKey = config.moltbookApiKey;
    this.rateLimitMs = config.rateLimitMs;
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequest;
    if (elapsed < this.rateLimitMs) {
      await new Promise((resolve) => setTimeout(resolve, this.rateLimitMs - elapsed));
    }
    this.lastRequest = Date.now();
  }

  private async fetchWithRetry(url: string, retries = 3): Promise<Response> {
    await this.throttle();

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(15_000),
        });

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get("Retry-After") || "5", 10);
          if (attempt < retries) {
            await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
            continue;
          }
        }

        if (!response.ok && attempt < retries) {
          const backoff = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }

        return response;
      } catch (error) {
        if (attempt === retries) throw error;
        const backoff = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }

    throw new Error("Max retries exceeded");
  }

  async fetchAgent(handle: string): Promise<MoltbookAgentResponse | null> {
    try {
      const response = await this.fetchWithRetry(
        `${BASE_URL}/agents/profile?name=${encodeURIComponent(handle)}`
      );
      if (response.status === 404) return null;
      if (!response.ok) {
        console.error(`[agentscore] Moltbook API error: ${response.status} for @${handle}`);
        return null;
      }
      const json: unknown = await response.json();
      const result = MoltbookAgentResponseSchema.safeParse(json);
      if (!result.success) {
        console.error(`[agentscore] Moltbook response validation failed for @${handle}:`, result.error.message);
        return null;
      }
      return result.data as MoltbookAgentResponse;
    } catch (error) {
      console.error(`[agentscore] Moltbook fetch error for @${handle}:`, error);
      return null;
    }
  }

  async fetchThread(postId: string): Promise<MoltbookThreadResponse | null> {
    try {
      const response = await this.fetchWithRetry(
        `${BASE_URL}/posts/${encodeURIComponent(postId)}/comments`
      );
      if (response.status === 404) return null;
      if (!response.ok) {
        console.error(`[agentscore] Moltbook API error: ${response.status} for thread ${postId}`);
        return null;
      }
      const json: unknown = await response.json();
      const result = MoltbookThreadResponseSchema.safeParse(json);
      if (!result.success) {
        console.error(`[agentscore] Moltbook thread response validation failed for ${postId}:`, result.error.message);
        return null;
      }
      return result.data as MoltbookThreadResponse;
    } catch (error) {
      console.error(`[agentscore] Moltbook thread fetch error for ${postId}:`, error);
      return null;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${BASE_URL}/posts?limit=1`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

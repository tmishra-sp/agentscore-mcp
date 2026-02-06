/**
 * Example: Building a Custom AgentScore Adapter
 *
 * This shows how to integrate AgentScore with a hypothetical "AgentHub" platform.
 * Copy this file, replace the mock API calls with real ones, and you're done.
 *
 * The adapter interface requires just 3 methods:
 *   - fetchProfile(handle) → agent's profile data
 *   - fetchContent(handle) → agent's posts/messages
 *   - isAvailable() → health check
 *
 * Optional methods for richer scoring:
 *   - fetchInteractions(handle) → agent's comments/replies
 *   - fetchThreadParticipants(threadId) → enables sweep tool
 *   - fetchThreadContent(threadId) → enables sweep tool
 */

import type {
  AgentPlatformAdapter,
  AgentProfile,
  AgentContent,
} from "../src/adapters/types.js";

// ─── Your platform's API types ──────────────────────────────────────────

interface AgentHubUser {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  reputation_score: number;
  follower_count: number;
  following_count: number;
  created_at: string;
  is_verified: boolean;
}

interface AgentHubMessage {
  id: string;
  author_id: string;
  body: string;
  subject?: string;
  likes: number;
  dislikes: number;
  reply_count: number;
  room?: string;
  type: "post" | "reply";
  created_at: string;
}

// ─── Mock API client (replace with real HTTP calls) ─────────────────────

class AgentHubClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async getUser(username: string): Promise<AgentHubUser | null> {
    // Replace with: fetch(`${this.baseUrl}/users/${username}`, { headers: { ... } })
    // For this example, return mock data:
    return {
      id: "usr_123",
      username,
      display_name: `${username} Bot`,
      bio: "I'm an AI assistant built on AgentHub.",
      reputation_score: 450,
      follower_count: 120,
      following_count: 30,
      created_at: "2024-06-15T00:00:00Z",
      is_verified: true,
    };
  }

  async getUserMessages(username: string, limit = 50): Promise<AgentHubMessage[]> {
    // Replace with: fetch(`${this.baseUrl}/users/${username}/messages?limit=${limit}`)
    return [];
  }

  async ping(): Promise<boolean> {
    // Replace with: fetch(`${this.baseUrl}/health`)
    return true;
  }
}

// ─── Transform functions: platform types → generic types ────────────────

function toAgentProfile(user: AgentHubUser): AgentProfile {
  return {
    handle: user.username,
    displayName: user.display_name,
    description: user.bio,
    platform: "agenthub",
    karma: user.reputation_score,
    followers: user.follower_count,
    following: user.following_count,
    createdAt: user.created_at,
    claimed: user.is_verified,
    // Put any platform-specific extras in metadata
    metadata: { agentHubId: user.id },
  };
}

function toAgentContent(msg: AgentHubMessage): AgentContent {
  return {
    id: msg.id,
    type: msg.type === "reply" ? "comment" : "post",
    content: msg.body,
    title: msg.subject,
    upvotes: msg.likes,
    downvotes: msg.dislikes,
    replyCount: msg.reply_count,
    channel: msg.room,
    createdAt: msg.created_at,
  };
}

// ─── The adapter ────────────────────────────────────────────────────────

export class AgentHubAdapter implements AgentPlatformAdapter {
  readonly name = "agenthub";
  readonly version = "1.0.0";
  private client: AgentHubClient;

  constructor() {
    // Read config from environment
    const baseUrl = process.env.AGENTHUB_API_URL || "https://api.agenthub.example.com";
    const apiKey = process.env.AGENTHUB_API_KEY || "";
    this.client = new AgentHubClient(baseUrl, apiKey);
  }

  async fetchProfile(handle: string): Promise<AgentProfile | null> {
    const user = await this.client.getUser(handle);
    if (!user) return null;
    return toAgentProfile(user);
  }

  async fetchContent(handle: string, limit?: number): Promise<AgentContent[]> {
    const messages = await this.client.getUserMessages(handle, limit);
    return messages.filter((m) => m.type === "post").map(toAgentContent);
  }

  // Optional: enables richer interaction scoring
  async fetchInteractions(handle: string, limit?: number): Promise<AgentContent[]> {
    const messages = await this.client.getUserMessages(handle, limit);
    return messages.filter((m) => m.type === "reply").map(toAgentContent);
  }

  async isAvailable(): Promise<boolean> {
    return this.client.ping();
  }
}

// ─── Wire it into the server ────────────────────────────────────────────
//
// In src/server.ts, add:
//
//   import { AgentHubAdapter } from "./adapters/agenthub/adapter.js";
//
//   if (config.adapter === "agenthub") {
//     adapters.agenthub = new AgentHubAdapter();
//   }
//
// Set AGENTSCORE_ADAPTER=agenthub in your environment.
// That's it. The scoring engine handles everything else.

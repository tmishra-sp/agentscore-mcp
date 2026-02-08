import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { AgentPlatformAdapter, AgentProfile, AgentContent } from "../types.js";
import { getConfig } from "../../config.js";
import { AGENTSCORE_VERSION } from "../../version.js";

const AgentContentSchema = z.object({
  id: z.string(),
  type: z.enum(["post", "comment", "message", "reply"]),
  content: z.string(),
  title: z.string().optional(),
  upvotes: z.number(),
  downvotes: z.number(),
  replyCount: z.number(),
  channel: z.string().optional(),
  createdAt: z.string(),
});

const AgentProfileSchema = z.object({
  handle: z.string(),
  displayName: z.string(),
  description: z.string(),
  platform: z.string(),
  karma: z.number(),
  followers: z.number(),
  following: z.number(),
  createdAt: z.string(),
  claimed: z.boolean(),
  owner: z.object({
    username: z.string(),
    verified: z.boolean(),
    followers: z.number(),
  }).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const JSONThreadSchema = z.object({
  id: z.string(),
  content: z.array(AgentContentSchema),
  participantHandles: z.array(z.string()).optional(),
});

const JSONDataFileSchema = z.object({
  agents: z.array(z.object({
    profile: AgentProfileSchema,
    content: z.array(AgentContentSchema),
    interactions: z.array(AgentContentSchema).optional(),
  })),
  threads: z.array(JSONThreadSchema).optional(),
});

interface JSONAgentData {
  profile: AgentProfile;
  content: AgentContent[];
  interactions?: AgentContent[];
}

interface JSONDataFile {
  agents: JSONAgentData[];
  threads?: {
    id: string;
    content: AgentContent[];
    participantHandles?: string[];
  }[];
}

/**
 * JSON adapter — reads agent data from a local JSON file.
 * Lets businesses pipe in ANY data source without writing code.
 *
 * Expected file format:
 * {
 *   "agents": [
 *     {
 *       "profile": { ...AgentProfile },
 *       "content": [ ...AgentContent[] ],
 *       "interactions": [ ...AgentContent[] ]  // optional
 *     }
 *   ],
 *   "threads": [ // optional, enables sweep in JSON adapter
 *     {
 *       "id": "thread-123",
 *       "participantHandles": ["agent-a", "agent-b"], // optional but recommended
 *       "content": [ ...AgentContent[] ]
 *     }
 *   ]
 * }
 */
export class JSONAdapter implements AgentPlatformAdapter {
  readonly name = "json";
  readonly version = AGENTSCORE_VERSION;
  private data: JSONDataFile | null = null;

  private async loadData(): Promise<JSONDataFile> {
    if (this.data) return this.data;

    const config = getConfig();
    try {
      const raw = await readFile(config.dataPath, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      const result = JSONDataFileSchema.safeParse(parsed);
      if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        throw new Error(`Schema validation failed: ${issues}`);
      }
      this.data = result.data as JSONDataFile;
      return this.data;
    } catch (error) {
      console.error(`[agentscore] Failed to load JSON data from ${config.dataPath}:`, error);
      if (error instanceof SyntaxError) {
        throw new Error("Invalid JSON in data file.");
      }
      throw new Error(
        error instanceof Error ? error.message : "Invalid JSON in data file."
      );
    }
  }

  async fetchProfile(handle: string): Promise<AgentProfile | null> {
    const data = await this.loadData();
    const agent = data.agents.find(
      (a) => a.profile.handle.toLowerCase() === handle.toLowerCase()
    );
    return agent?.profile ?? null;
  }

  async fetchContent(handle: string, limit?: number): Promise<AgentContent[]> {
    const data = await this.loadData();
    const agent = data.agents.find(
      (a) => a.profile.handle.toLowerCase() === handle.toLowerCase()
    );
    if (!agent) return [];
    return limit ? agent.content.slice(0, limit) : agent.content;
  }

  async fetchInteractions(handle: string, limit?: number): Promise<AgentContent[]> {
    const data = await this.loadData();
    const agent = data.agents.find(
      (a) => a.profile.handle.toLowerCase() === handle.toLowerCase()
    );
    if (!agent?.interactions) return [];
    return limit ? agent.interactions.slice(0, limit) : agent.interactions;
  }

  async fetchThreadContent(threadId: string): Promise<AgentContent[]> {
    const data = await this.loadData();
    const thread = data.threads?.find((t) => t.id === threadId);
    if (!thread) return [];
    return thread.content;
  }

  async fetchThreadParticipants(threadId: string): Promise<AgentProfile[]> {
    const data = await this.loadData();
    const thread = data.threads?.find((t) => t.id === threadId);
    if (!thread?.participantHandles || thread.participantHandles.length === 0) {
      return [];
    }

    const handles = new Set(
      thread.participantHandles
        .map((h) => h.trim().toLowerCase())
        .filter((h) => h.length > 0)
    );

    const profiles: AgentProfile[] = [];
    for (const handle of handles) {
      const agent = data.agents.find((a) => a.profile.handle.toLowerCase() === handle);
      if (agent) {
        profiles.push(agent.profile);
      }
    }

    return profiles;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.loadData();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Demo Adapter — the default, zero-config experience.
 *
 * Ships with 10 built-in fictional agents spanning every trust tier.
 * No API keys, no env vars, no data files. Install and ask.
 *
 * Also implements thread operations for the sweep tool demo.
 */

import type { AgentPlatformAdapter, AgentProfile, AgentContent } from "../types.js";
import {
  DEMO_AGENTS,
  DEMO_THREAD_ID,
  DEMO_THREAD_CONTENT,
  DEMO_THREAD_AUTHORS,
} from "./agents.js";
import { AGENTSCORE_VERSION } from "../../version.js";

const DEMO_HANDLE_ALIASES: Record<string, string> = {
  "claims-assist-v3": "NovaMind",
  "onboard-concierge": "HelperBot",
  "quickquote-express": "SpamBot3000",
  "qq-satisfied-user": "SockPuppet1",
};

const DEMO_THREAD_ALIASES: Record<string, string> = {
  "vendor-eval-thread-2026": DEMO_THREAD_ID,
};

export class DemoAdapter implements AgentPlatformAdapter {
  readonly name = "demo";
  readonly version = AGENTSCORE_VERSION;

  async fetchProfile(handle: string): Promise<AgentProfile | null> {
    const agent = this.findAgent(handle);
    return agent?.profile ?? null;
  }

  async fetchContent(handle: string, limit?: number): Promise<AgentContent[]> {
    const agent = this.findAgent(handle);
    if (!agent) return [];
    const content = agent.content;
    return limit ? content.slice(0, limit) : content;
  }

  async fetchInteractions(handle: string, limit?: number): Promise<AgentContent[]> {
    const agent = this.findAgent(handle);
    if (!agent) return [];
    const interactions = agent.interactions;
    return limit ? interactions.slice(0, limit) : interactions;
  }

  async fetchThreadParticipants(threadId: string): Promise<AgentProfile[]> {
    const resolvedThreadId = this.resolveThreadId(threadId);
    if (resolvedThreadId !== DEMO_THREAD_ID) return [];

    // Get unique participant handles from the thread
    const handles = new Set(Object.values(DEMO_THREAD_AUTHORS));
    const profiles: AgentProfile[] = [];
    for (const handle of handles) {
      const agent = this.findAgent(handle);
      if (agent) profiles.push(agent.profile);
    }
    return profiles;
  }

  async fetchThreadContent(threadId: string): Promise<AgentContent[]> {
    const resolvedThreadId = this.resolveThreadId(threadId);
    if (resolvedThreadId !== DEMO_THREAD_ID) return [];
    return DEMO_THREAD_CONTENT;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  /** Case-insensitive agent lookup. */
  private findAgent(handle: string) {
    const resolvedHandle = this.resolveHandle(handle);

    // Try exact match first
    if (DEMO_AGENTS[resolvedHandle]) return DEMO_AGENTS[resolvedHandle];

    // Case-insensitive fallback
    const lower = resolvedHandle.toLowerCase();
    for (const [key, agent] of Object.entries(DEMO_AGENTS)) {
      if (key.toLowerCase() === lower) return agent;
    }
    return null;
  }

  private resolveHandle(handle: string): string {
    const lower = handle.toLowerCase();
    return DEMO_HANDLE_ALIASES[lower] ?? handle;
  }

  private resolveThreadId(threadId: string): string {
    const lower = threadId.toLowerCase();
    return DEMO_THREAD_ALIASES[lower] ?? threadId;
  }
}

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
    if (threadId !== DEMO_THREAD_ID) return [];

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
    if (threadId !== DEMO_THREAD_ID) return [];
    return DEMO_THREAD_CONTENT;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  /** Case-insensitive agent lookup. */
  private findAgent(handle: string) {
    // Try exact match first
    if (DEMO_AGENTS[handle]) return DEMO_AGENTS[handle];

    // Case-insensitive fallback
    const lower = handle.toLowerCase();
    for (const [key, agent] of Object.entries(DEMO_AGENTS)) {
      if (key.toLowerCase() === lower) return agent;
    }
    return null;
  }
}

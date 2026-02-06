import { readFile } from "node:fs/promises";
import type { AgentPlatformAdapter, AgentProfile, AgentContent } from "../types.js";
import { getConfig } from "../../config.js";

interface JSONAgentData {
  profile: AgentProfile;
  content: AgentContent[];
  interactions?: AgentContent[];
}

interface JSONDataFile {
  agents: JSONAgentData[];
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
 *   ]
 * }
 */
export class JSONAdapter implements AgentPlatformAdapter {
  readonly name = "json";
  readonly version = "1.0.0";
  private data: JSONDataFile | null = null;

  private async loadData(): Promise<JSONDataFile> {
    if (this.data) return this.data;

    const config = getConfig();
    try {
      const raw = await readFile(config.dataPath, "utf-8");
      this.data = JSON.parse(raw) as JSONDataFile;
      return this.data;
    } catch (error) {
      console.error(`[agentscore] Failed to load JSON data from ${config.dataPath}:`, error);
      throw new Error(`Invalid JSON in data file: ${config.dataPath}`);
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

  async isAvailable(): Promise<boolean> {
    try {
      await this.loadData();
      return true;
    } catch {
      return false;
    }
  }
}

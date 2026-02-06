import type { AgentPlatformAdapter, AgentProfile, AgentContent } from "../types.js";
import { GitHubClient } from "./client.js";
import {
  mapProfile,
  mapSearchIssueToContent,
  mapEventToContent,
  mapIssueToContent,
  mapCommentToContent,
  parseThreadId,
} from "./mapper.js";

/** GitHub platform adapter — scores any public GitHub account. */
export class GitHubAdapter implements AgentPlatformAdapter {
  readonly name = "github";
  readonly version = "1.0.0";
  private client: GitHubClient;

  constructor() {
    this.client = new GitHubClient();
  }

  async fetchProfile(handle: string): Promise<AgentProfile | null> {
    const user = await this.client.fetchUser(handle);
    if (!user) return null;

    const repos = await this.client.fetchUserRepos(handle);

    // For bot accounts, try to look up the owning app
    let app = null;
    if (user.type === "Bot") {
      app = await this.client.fetchApp(handle);
    }

    return mapProfile(user, repos, app);
  }

  async fetchContent(handle: string, limit = 30): Promise<AgentContent[]> {
    const result = await this.client.searchIssues(`author:${handle}`, limit);
    return result.items.map(mapSearchIssueToContent);
  }

  async fetchInteractions(handle: string): Promise<AgentContent[]> {
    const events = await this.client.fetchUserEvents(handle);

    const interactions: AgentContent[] = [];
    for (const event of events) {
      const content = mapEventToContent(event);
      if (content) interactions.push(content);
    }
    return interactions;
  }

  async fetchThreadContent(threadId: string): Promise<AgentContent[]> {
    const { owner, repo, number } = parseThreadId(threadId);

    const issue = await this.client.fetchIssue(owner, repo, number);
    if (!issue) return [];

    const comments = await this.client.fetchIssueComments(owner, repo, number);

    const content: AgentContent[] = [mapIssueToContent(issue)];
    for (const comment of comments) {
      content.push(mapCommentToContent(comment));
    }
    return content;
  }

  async fetchThreadParticipants(threadId: string): Promise<AgentProfile[]> {
    const { owner, repo, number } = parseThreadId(threadId);

    const issue = await this.client.fetchIssue(owner, repo, number);
    if (!issue) return [];

    const comments = await this.client.fetchIssueComments(owner, repo, number);

    // Collect unique usernames
    const handles = new Set<string>();
    handles.add(issue.user.login);
    for (const comment of comments) {
      handles.add(comment.user.login);
    }

    // Fetch profile for each unique participant
    const profiles: AgentProfile[] = [];
    for (const handle of handles) {
      const profile = await this.fetchProfile(handle);
      if (profile) profiles.push(profile);
    }
    return profiles;
  }

  async isAvailable(): Promise<boolean> {
    return this.client.isAvailable();
  }
}

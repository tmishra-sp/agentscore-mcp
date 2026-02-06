import type { AgentPlatformAdapter, AgentProfile, AgentContent } from "../types.js";
import { MoltbookClient } from "./client.js";
import type { MoltbookPost, MoltbookComment } from "./types.js";

/** Moltbook platform adapter — the default adapter. */
export class MoltbookAdapter implements AgentPlatformAdapter {
  readonly name = "moltbook";
  readonly version = "1.0.0";
  private client: MoltbookClient;

  constructor() {
    this.client = new MoltbookClient();
  }

  async fetchProfile(handle: string): Promise<AgentProfile | null> {
    const data = await this.client.fetchAgent(handle);
    if (!data) return null;

    const agent = data.agent;
    return {
      handle: agent.name,
      displayName: agent.displayName || agent.name,
      description: agent.description || "",
      platform: "moltbook",
      karma: agent.karma,
      followers: agent.followers,
      following: agent.following,
      createdAt: agent.createdAt,
      claimed: agent.claimed,
      owner: agent.owner
        ? {
            username: agent.owner.username,
            verified: agent.owner.verified,
            followers: agent.owner.followers,
          }
        : undefined,
      metadata: {
        profileImage: agent.profileImage,
      },
    };
  }

  async fetchContent(handle: string, limit?: number): Promise<AgentContent[]> {
    const data = await this.client.fetchAgent(handle);
    if (!data) return [];

    const posts = data.recentPosts.map((p) => this.transformPost(p));
    return limit ? posts.slice(0, limit) : posts;
  }

  async fetchInteractions(handle: string, limit?: number): Promise<AgentContent[]> {
    const data = await this.client.fetchAgent(handle);
    if (!data) return [];

    const comments = data.recentComments.map((c) => this.transformComment(c));
    return limit ? comments.slice(0, limit) : comments;
  }

  async fetchThreadParticipants(threadId: string): Promise<AgentProfile[]> {
    // Thread participants require scoring each commenter — handled at tool level.
    // Here we return profile stubs from the thread data.
    const data = await this.client.fetchThread(threadId);
    if (!data) return [];

    // Extract unique author handles from comments and fetch profiles
    const handles = new Set<string>();
    // Moltbook comments include agent author info if available
    // For now, return empty — the sweep tool will score participants individually
    return [];
  }

  async fetchThreadContent(threadId: string): Promise<AgentContent[]> {
    const data = await this.client.fetchThread(threadId);
    if (!data) return [];

    const content: AgentContent[] = [this.transformPost(data.post)];
    for (const comment of data.comments) {
      content.push(this.transformComment(comment));
    }
    return content;
  }

  async isAvailable(): Promise<boolean> {
    return this.client.isAvailable();
  }

  private transformPost(post: MoltbookPost): AgentContent {
    return {
      id: post._id,
      type: "post",
      content: post.content,
      title: post.title,
      upvotes: post.upvotes,
      downvotes: post.downvotes,
      replyCount: post.commentCount,
      channel: post.submolt?.name,
      createdAt: post.createdAt,
    };
  }

  private transformComment(comment: MoltbookComment): AgentContent {
    return {
      id: comment._id,
      type: "comment",
      content: comment.content,
      upvotes: comment.upvotes,
      downvotes: comment.downvotes,
      replyCount: comment.replyCount || 0,
      createdAt: comment.createdAt,
    };
  }
}

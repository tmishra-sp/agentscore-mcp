import type { AgentPlatformAdapter, AgentProfile, AgentContent } from "../types.js";
import { MoltbookClient } from "./client.js";
import type { MoltbookPost, MoltbookComment, MoltbookAuthor } from "./types.js";

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
    const data = await this.client.fetchThread(threadId);
    if (!data) return [];

    const handles = new Set<string>();
    const postHandle = this.authorHandle(data.post.author);
    if (postHandle) handles.add(postHandle);
    for (const comment of data.comments) {
      const commentHandle = this.authorHandle(comment.author);
      if (commentHandle) handles.add(commentHandle);
    }

    if (handles.size === 0) return [];

    const profiles: AgentProfile[] = [];
    for (const handle of handles) {
      const profile = await this.fetchProfile(handle);
      if (profile) profiles.push(profile);
    }
    return profiles;
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

  private authorHandle(author?: MoltbookAuthor): string | null {
    if (!author) return null;
    const value = (author.name || author.username || "").trim();
    return value.length > 0 ? value : null;
  }
}

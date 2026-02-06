export interface AgentProfile {
  handle: string;
  displayName: string;
  description: string;
  platform: string;
  karma: number;
  followers: number;
  following: number;
  createdAt: string;
  claimed: boolean;
  owner?: {
    username: string;
    verified: boolean;
    followers: number;
  };
  metadata?: Record<string, unknown>;
}

export interface AgentContent {
  id: string;
  type: "post" | "comment" | "message" | "reply";
  content: string;
  title?: string;
  upvotes: number;
  downvotes: number;
  replyCount: number;
  channel?: string;
  createdAt: string;
}

export interface AgentPlatformAdapter {
  readonly name: string;
  readonly version: string;

  /** Fetch an agent's profile by handle. */
  fetchProfile(handle: string): Promise<AgentProfile | null>;

  /** Fetch an agent's content (posts, messages). */
  fetchContent(handle: string, limit?: number): Promise<AgentContent[]>;

  /** Fetch an agent's interactions (comments, replies). Optional. */
  fetchInteractions?(handle: string, limit?: number): Promise<AgentContent[]>;

  /** Fetch all participants in a thread. Optional — enables sweep tool. */
  fetchThreadParticipants?(threadId: string): Promise<AgentProfile[]>;

  /** Fetch all content in a thread. Optional — enables sweep tool. */
  fetchThreadContent?(threadId: string): Promise<AgentContent[]>;

  /** Health check — is the adapter's data source reachable? */
  isAvailable(): Promise<boolean>;
}

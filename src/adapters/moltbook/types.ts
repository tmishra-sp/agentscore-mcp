/** Moltbook API response types. */

export interface MoltbookAgentResponse {
  agent: {
    name: string;
    displayName?: string;
    description?: string;
    karma: number;
    followers: number;
    following: number;
    createdAt: string;
    claimed: boolean;
    profileImage?: string;
    owner?: {
      username: string;
      verified: boolean;
      followers: number;
    };
  };
  recentPosts: MoltbookPost[];
  recentComments: MoltbookComment[];
}

export interface MoltbookAuthor {
  name?: string;
  username?: string;
  displayName?: string;
}

export interface MoltbookPost {
  _id: string;
  title?: string;
  content: string;
  upvotes: number;
  downvotes: number;
  commentCount: number;
  submolt?: { name: string };
  author?: MoltbookAuthor;
  createdAt: string;
}

export interface MoltbookComment {
  _id: string;
  content: string;
  upvotes: number;
  downvotes: number;
  replyCount?: number;
  post?: { _id: string; title?: string };
  author?: MoltbookAuthor;
  createdAt: string;
}

export interface MoltbookThreadResponse {
  post: MoltbookPost;
  comments: MoltbookComment[];
}

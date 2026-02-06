/** GitHub API response types — only fields we actually use. */

export interface GitHubUser {
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  blog: string | null;
  type: "User" | "Organization" | "Bot";
  followers: number;
  following: number;
  public_repos: number;
  created_at: string;
}

export interface GitHubRepo {
  name: string;
  stargazers_count: number;
}

export interface GitHubSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubSearchIssue[];
}

export interface GitHubSearchIssue {
  id: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  comments: number;
  created_at: string;
  reactions: GitHubReactions;
  repository_url: string;
}

export interface GitHubReactions {
  "+1": number;
  "-1": number;
  laugh: number;
  hooray: number;
  confused: number;
  heart: number;
  rocket: number;
  eyes: number;
}

export interface GitHubEvent {
  id: string;
  type: string;
  created_at: string;
  repo: { name: string };
  payload: {
    action?: string;
    comment?: { body: string; id: number; created_at: string };
    review?: { body: string | null; id: number; state: string; submitted_at: string };
  };
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  comments: number;
  created_at: string;
  user: { login: string; type: string };
  reactions: GitHubReactions;
  html_url: string;
}

export interface GitHubComment {
  id: number;
  body: string;
  created_at: string;
  user: { login: string; type: string };
  reactions: GitHubReactions;
}

export interface GitHubRateLimit {
  resources: {
    core: { limit: number; remaining: number; reset: number };
    search: { limit: number; remaining: number; reset: number };
  };
}

export interface GitHubApp {
  name: string;
  slug: string;
  owner: { login: string; type: string } | null;
}

export interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

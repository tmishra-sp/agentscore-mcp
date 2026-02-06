import type { AgentProfile, AgentContent } from "../types.js";
import type {
  GitHubUser,
  GitHubRepo,
  GitHubSearchIssue,
  GitHubEvent,
  GitHubIssue,
  GitHubComment,
  GitHubReactions,
  GitHubApp,
} from "./types.js";

/** Pure transformation functions — no network calls, no side effects. */

export function computeKarma(user: GitHubUser, repos: GitHubRepo[]): number {
  const totalStars = repos.reduce((sum, r) => sum + r.stargazers_count, 0);
  return (user.followers * 3) + (totalStars * 2) + user.public_repos;
}

export function isClaimed(user: GitHubUser): boolean {
  if (user.type === "Bot") return true;
  return !!(user.name && (user.bio || user.company || user.blog));
}

export function mapOwner(
  user: GitHubUser,
  app: GitHubApp | null,
): AgentProfile["owner"] {
  // Only bot accounts get owner mapping
  if (user.type !== "Bot" || !app?.owner) return undefined;
  return {
    username: app.owner.login,
    verified: true, // GitHub-verified bot association
    followers: 0, // Not available from /apps endpoint
  };
}

export function mapProfile(
  user: GitHubUser,
  repos: GitHubRepo[],
  app: GitHubApp | null,
): AgentProfile {
  return {
    handle: user.login,
    displayName: user.name || user.login,
    description: user.bio || "",
    platform: "github",
    karma: computeKarma(user, repos),
    followers: user.followers,
    following: user.following,
    createdAt: user.created_at,
    claimed: isClaimed(user),
    owner: mapOwner(user, app),
    metadata: {
      type: user.type,
      publicRepos: user.public_repos,
    },
  };
}

function repoFromUrl(repositoryUrl: string): string {
  // "https://api.github.com/repos/owner/repo" → "owner/repo"
  const parts = repositoryUrl.split("/repos/");
  return parts[1] || repositoryUrl;
}

function reactionsToVotes(reactions: GitHubReactions): { upvotes: number; downvotes: number } {
  return {
    upvotes: reactions["+1"] + reactions.heart + reactions.hooray + reactions.rocket,
    downvotes: reactions["-1"] + reactions.confused,
  };
}

export function mapSearchIssueToContent(issue: GitHubSearchIssue): AgentContent {
  const votes = reactionsToVotes(issue.reactions);
  return {
    id: String(issue.id),
    type: "post",
    content: issue.body || "",
    title: issue.title,
    upvotes: votes.upvotes,
    downvotes: votes.downvotes,
    replyCount: issue.comments,
    channel: repoFromUrl(issue.repository_url),
    createdAt: issue.created_at,
  };
}

export function mapEventToContent(event: GitHubEvent): AgentContent | null {
  const comment = event.payload.comment;
  const review = event.payload.review;

  let body: string | null = null;
  let id: string;
  let createdAt: string;

  if (comment) {
    body = comment.body;
    id = String(comment.id);
    createdAt = comment.created_at;
  } else if (review && review.body) {
    body = review.body;
    id = String(review.id);
    createdAt = review.submitted_at;
  } else {
    return null; // Skip events without textual content
  }

  return {
    id,
    type: "comment",
    content: body || "",
    upvotes: 0,
    downvotes: 0,
    replyCount: 0,
    channel: event.repo.name,
    createdAt,
  };
}

export function mapIssueToContent(issue: GitHubIssue): AgentContent {
  const votes = reactionsToVotes(issue.reactions);
  return {
    id: String(issue.id),
    type: "post",
    content: issue.body || "",
    title: issue.title,
    upvotes: votes.upvotes,
    downvotes: votes.downvotes,
    replyCount: issue.comments,
    createdAt: issue.created_at,
  };
}

export function mapCommentToContent(comment: GitHubComment): AgentContent {
  const votes = reactionsToVotes(comment.reactions);
  return {
    id: String(comment.id),
    type: "reply",
    content: comment.body,
    upvotes: votes.upvotes,
    downvotes: votes.downvotes,
    replyCount: 0,
    createdAt: comment.created_at,
  };
}

/** Parse thread ID format: "owner/repo/issues/123" (pulls also accepted) */
export function parseThreadId(threadId: string): { owner: string; repo: string; number: number } {
  const parts = threadId.split("/");
  const kind = parts[2];
  if (parts.length !== 4 || (kind !== "issues" && kind !== "pulls" && kind !== "pull")) {
    throw new Error(
      `Invalid GitHub thread ID: "${threadId}". Expected format: owner/repo/issues/123 (or owner/repo/pulls/123)`
    );
  }
  const num = parseInt(parts[3], 10);
  if (isNaN(num) || num <= 0) {
    throw new Error(
      `Invalid issue number in thread ID: "${threadId}". Expected a positive integer.`
    );
  }
  return { owner: parts[0], repo: parts[1], number: num };
}

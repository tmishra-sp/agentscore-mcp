import type { AgentContent } from "../../adapters/types.js";
import type { CategoryScore, ScoringContext } from "../types.js";

/** Content Quality — 25% weight. Measures depth, diversity, and resonance. */
export function scoreContentQuality(ctx: ScoringContext): CategoryScore {
  const posts = ctx.content.filter((c) => c.type === "post");
  const signals: string[] = [];
  let score = 0;

  // Post volume (0-25)
  const volumeScore = Math.min(posts.length / 40, 1) * 25;
  score += volumeScore;
  if (posts.length === 0) signals.push("No posts found");

  // Upvote ratio (0-25)
  const totalUp = posts.reduce((s, p) => s + p.upvotes, 0);
  const totalDown = posts.reduce((s, p) => s + p.downvotes, 0);
  const total = totalUp + totalDown;
  const ratioScore = total > 0 ? (totalUp / total) * 25 : 0;
  score += ratioScore;
  if (total > 0 && totalUp / total > 0.9) signals.push(`${Math.round((totalUp / total) * 100)}% approval rate`);
  if (total > 0 && totalUp / total < 0.5) signals.push("Majority negative reception");

  // Content depth (0-20)
  const avgLength = posts.length > 0 ? posts.reduce((s, p) => s + p.content.length, 0) / posts.length : 0;
  const depthScore = Math.min(avgLength / 500, 1) * 20;
  score += depthScore;
  if (avgLength > 400) signals.push(`Avg post length ${Math.round(avgLength)} chars — substantial`);
  if (avgLength < 50 && posts.length > 0) signals.push("Very short posts");

  // Channel diversity (0-15)
  const channels = new Set(posts.map((p) => p.channel).filter(Boolean));
  const diversityScore = Math.min(channels.size / 5, 1) * 15;
  score += diversityScore;
  if (channels.size >= 5) signals.push(`Active across ${channels.size} channels`);

  // Engagement received (0-15)
  const avgReplies = posts.length > 0 ? posts.reduce((s, p) => s + p.replyCount, 0) / posts.length : 0;
  const engagementScore = Math.min(avgReplies / 10, 1) * 15;
  score += engagementScore;

  const topSignal = signals[0] || (score > 70 ? "Solid content output" : "Limited content data");

  return { name: "Content Quality", score: Math.round(score), weight: 25, topSignal };
}

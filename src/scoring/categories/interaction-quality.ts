import type { CategoryScore, ScoringContext } from "../types.js";

/** Interaction Quality — 20% weight. Measures engagement depth and balance. */
export function scoreInteractionQuality(ctx: ScoringContext): CategoryScore {
  const interactions = ctx.interactions;
  const posts = ctx.content.filter((c) => c.type === "post");
  const signals: string[] = [];
  let score = 0;

  // Comment/reply volume (0-25)
  const volumeScore = Math.min(interactions.length / 50, 1) * 25;
  score += volumeScore;
  if (interactions.length === 0) signals.push("No interactions found");

  // Reply depth (0-25)
  const avgReplyLen =
    interactions.length > 0
      ? interactions.reduce((s, c) => s + c.content.length, 0) / interactions.length
      : 0;
  const depthScore = Math.min(avgReplyLen / 300, 1) * 25;
  score += depthScore;
  if (avgReplyLen > 200) signals.push(`Avg reply length ${Math.round(avgReplyLen)} chars — thoughtful`);

  // Reply upvote ratio (0-25)
  const totalUp = interactions.reduce((s, c) => s + c.upvotes, 0);
  const totalDown = interactions.reduce((s, c) => s + c.downvotes, 0);
  const total = totalUp + totalDown;
  const ratioScore = total > 0 ? (totalUp / total) * 25 : 0;
  score += ratioScore;

  // Post/reply balance (0-25) — ideal ratio 0.3-0.8
  const totalItems = posts.length + interactions.length;
  if (totalItems > 0) {
    const replyRatio = interactions.length / totalItems;
    let balanceScore: number;
    if (replyRatio >= 0.3 && replyRatio <= 0.8) {
      balanceScore = 25;
    } else if (replyRatio < 0.3) {
      balanceScore = (replyRatio / 0.3) * 25;
    } else {
      balanceScore = ((1 - replyRatio) / 0.2) * 25;
    }
    score += Math.max(0, balanceScore);
    if (replyRatio >= 0.3 && replyRatio <= 0.8) signals.push("Healthy post/reply balance");
    if (replyRatio < 0.1) signals.push("Almost no interaction — broadcast-only");
  }

  const topSignal = signals[0] || (score > 70 ? "Strong engagement profile" : "Limited interaction data");

  return { name: "Interaction Quality", score: Math.round(score), weight: 20, topSignal };
}

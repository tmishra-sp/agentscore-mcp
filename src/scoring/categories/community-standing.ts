import type { CategoryScore, ScoringContext } from "../types.js";

/** Community Standing — 5% weight. Social proof, verification, network effects. */
export function scoreCommunityStanding(ctx: ScoringContext): CategoryScore {
  const { profile } = ctx;
  const signals: string[] = [];
  let score = 0;

  // Follower count (0-40)
  if (profile.followers >= 1000) { score += 40; signals.push(`${profile.followers} followers`); }
  else if (profile.followers >= 500) score += 32;
  else if (profile.followers >= 100) score += 24;
  else if (profile.followers >= 50) score += 16;
  else if (profile.followers >= 10) score += 8;
  else score += 2;

  // Owner verification (0-30)
  if (profile.owner?.verified) {
    score += 30;
    signals.push("Owner verified");
  } else if (profile.owner) {
    score += 10;
    signals.push("Has owner, not verified");
  }

  // Owner followers (0-30)
  if (profile.owner) {
    const ownerFollowers = profile.owner.followers;
    if (ownerFollowers >= 10000) score += 30;
    else if (ownerFollowers >= 1000) score += 20;
    else if (ownerFollowers >= 100) score += 10;
    else score += 3;
  }

  const topSignal = signals[0] || (score > 60 ? "Established community presence" : "Limited community footprint");

  return { name: "Community Standing", score: Math.round(score), weight: 5, topSignal };
}

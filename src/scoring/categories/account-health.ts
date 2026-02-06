import type { CategoryScore, ScoringContext } from "../types.js";
import { daysSince } from "../utils.js";

/** Account Health — 10% weight. Measures age, reputation, and completeness. */
export function scoreAccountHealth(ctx: ScoringContext): CategoryScore {
  const { profile } = ctx;
  const signals: string[] = [];
  let score = 0;

  // Account age (0-30)
  const age = daysSince(profile.createdAt);
  if (age > 365) { score += 30; signals.push(`Account age: ${Math.round(age)} days`); }
  else if (age > 180) score += 25;
  else if (age > 90) score += 20;
  else if (age > 30) score += 15;
  else if (age > 7) score += 8;
  else { score += 3; signals.push(`New account — only ${Math.round(age)} days old`); }

  // Karma level (0-30)
  if (profile.karma >= 1000) score += 30;
  else if (profile.karma >= 500) score += 25;
  else if (profile.karma >= 100) score += 20;
  else if (profile.karma >= 50) score += 15;
  else if (profile.karma >= 10) score += 10;
  else score += 3;

  // Follower/following ratio (0-20)
  if (profile.followers > 0 && profile.following > 0) {
    const ratio = profile.followers / profile.following;
    if (ratio >= 1) score += 20;
    else if (ratio >= 0.5) score += 15;
    else if (ratio >= 0.2) score += 10;
    else score += 5;
  } else if (profile.followers > 0) {
    score += 15;
  }

  // Profile completeness (0-20): name + description + avatar + claimed (5 each)
  let completeness = 0;
  if (profile.displayName && profile.displayName.trim().length > 0) completeness += 5;
  if (profile.description && profile.description.trim().length > 0) completeness += 5;
  if (profile.metadata?.avatar || profile.metadata?.profileImage) completeness += 5;
  if (profile.claimed) completeness += 5;
  score += completeness;

  const topSignal = signals[0] || (score > 70 ? "Healthy account fundamentals" : "Developing account");

  return { name: "Account Health", score: Math.round(score), weight: 10, topSignal };
}

import type { CategoryScore, ScoringContext } from "../types.js";
import { coefficientOfVariation, daysSince } from "../utils.js";

/** Behavioral Consistency — 20% weight. Measures rhythm, recency, and identity. */
export function scoreBehavioralConsistency(ctx: ScoringContext): CategoryScore {
  const allContent = [...ctx.content, ...ctx.interactions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const signals: string[] = [];
  let score = 0;

  // Posting frequency regularity (0-30)
  if (allContent.length >= 2) {
    const timestamps = allContent.map((c) => new Date(c.createdAt).getTime());
    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }
    const cv = coefficientOfVariation(intervals);
    // Lower CV = more regular. cv < 0.5 is very regular, > 2 is erratic.
    const regularity = Math.max(0, 1 - cv / 2);
    score += regularity * 30;
    if (cv < 0.5) signals.push("Highly regular posting cadence");
    if (cv > 2) signals.push("Erratic posting pattern");
  }

  // Active recency (0-30)
  if (allContent.length > 0) {
    const latest = allContent[allContent.length - 1];
    const days = daysSince(latest.createdAt);
    let recencyScore: number;
    if (days <= 1) recencyScore = 30;
    else if (days <= 7) recencyScore = 25;
    else if (days <= 30) recencyScore = 15;
    else if (days <= 90) recencyScore = 8;
    else recencyScore = 2;
    score += recencyScore;
    if (days <= 1) signals.push("Active within last 24 hours");
    if (days > 90) signals.push(`Inactive for ${Math.round(days)} days`);
  }

  // Claimed/verified status (0-20)
  if (ctx.profile.claimed) {
    score += 20;
    signals.push("Claimed by verified owner");
  } else {
    score += 5;
    signals.push("Unclaimed account");
  }

  // Description quality (0-20)
  const descLen = (ctx.profile.description || "").length;
  if (descLen >= 200) score += 20;
  else if (descLen >= 100) score += 15;
  else if (descLen >= 30) score += 10;
  else score += 3;

  const topSignal = signals[0] || (score > 70 ? "Consistent behavior profile" : "Limited behavioral data");

  return { name: "Behavioral Consistency", score: Math.round(score), weight: 20, topSignal };
}

import type { AgentProfile } from "../adapters/types.js";
import type { CategoryScore, ScoringContext, Tier } from "./types.js";
import { daysSince } from "./utils.js";

/** Generate a narrative intelligence briefing. Sharp, specific, opinionated. */
export function generateBriefing(
  profile: AgentProfile,
  score: number,
  tier: Tier,
  categories: CategoryScore[],
  flags: string[],
  ctx: ScoringContext
): string {
  const ageDays = Math.round(daysSince(profile.createdAt));
  const postCount = ctx.content.filter((c) => c.type === "post").length;
  const interactionCount = ctx.interactions.length;
  const totalContent = ctx.content.length + ctx.interactions.length;

  const risk = categories.find((c) => c.name === "Risk Signals");
  const content = categories.find((c) => c.name === "Content Quality");
  const behavior = categories.find((c) => c.name === "Behavioral Consistency");

  const channels = new Set(ctx.content.map((c) => c.channel).filter(Boolean));
  const avgPostLen =
    postCount > 0
      ? Math.round(ctx.content.filter((c) => c.type === "post").reduce((s, c) => s + c.content.length, 0) / postCount)
      : 0;

  const totalUp = ctx.content.reduce((s, c) => s + c.upvotes, 0);
  const totalDown = ctx.content.reduce((s, c) => s + c.downvotes, 0);
  const approvalRate = totalUp + totalDown > 0 ? Math.round((totalUp / (totalUp + totalDown)) * 100) : 0;

  // Build sentences based on what's most notable
  const sentences: string[] = [];

  if (tier === "Excellent" || tier === "Good") {
    sentences.push(buildPositiveOpener(profile, ageDays, approvalRate, channels.size, postCount));
    if (avgPostLen > 0) {
      sentences.push(buildContentNote(avgPostLen, risk));
    }
    sentences.push(buildRiskNote(risk, flags));
    sentences.push(score >= 750 ? "Recommended for interaction." : "Generally safe for interaction.");
  } else if (tier === "Fair") {
    sentences.push(buildNeutralOpener(profile, ageDays, postCount, totalContent));
    sentences.push(buildWeaknesses(categories));
    if (flags.length > 0) {
      sentences.push(`Notable: ${flags[0]}.`);
    }
    sentences.push("Proceed with standard caution.");
  } else if (tier === "Poor") {
    sentences.push(buildConcernOpener(profile, ageDays, postCount));
    sentences.push(buildPatternAnalysis(ctx, categories));
    if (flags.length > 0) {
      sentences.push(flags.slice(0, 2).join(". ") + ".");
    }
    sentences.push("Exercise caution.");
  } else {
    // Critical
    sentences.push(buildCriticalOpener(flags));
    sentences.push(buildCriticalEvidence(ctx, profile, ageDays, categories));
    sentences.push("Recommend avoidance.");
  }

  return sentences.filter(Boolean).join(" ");
}

function buildPositiveOpener(
  profile: AgentProfile,
  ageDays: number,
  approvalRate: number,
  channelCount: number,
  postCount: number
): string {
  if (approvalRate > 90 && channelCount >= 3) {
    return `Subject has maintained consistent output over ${ageDays} days with a ${approvalRate}% approval rate across ${channelCount} communities.`;
  }
  if (postCount > 30) {
    return `Subject demonstrates prolific output — ${postCount} posts over ${ageDays} days with ${approvalRate}% positive reception.`;
  }
  return `Subject active for ${ageDays} days with ${postCount} posts and ${approvalRate}% approval.`;
}

function buildContentNote(avgPostLen: number, risk: CategoryScore | undefined): string {
  if (avgPostLen > 400) {
    return `Content shows genuine depth — average post length exceeds ${avgPostLen} characters${risk && risk.score >= 90 ? " with zero spam signals detected" : ""}.`;
  }
  if (avgPostLen > 200) {
    return `Content is substantive at ${avgPostLen} characters average length.`;
  }
  return `Posts tend toward brevity at ${avgPostLen} characters average.`;
}

function buildRiskNote(risk: CategoryScore | undefined, flags: string[]): string {
  if (!risk) return "";
  if (risk.score >= 95) return "Clean record.";
  if (risk.score >= 70) return `Minor risk indicators: ${risk.topSignal}.`;
  return flags.length > 0 ? `Risk flags: ${flags[0]}.` : "Elevated risk signals present.";
}

function buildNeutralOpener(
  profile: AgentProfile,
  ageDays: number,
  postCount: number,
  totalContent: number
): string {
  if (totalContent < 10) {
    return `Limited data on subject — ${totalContent} total content items over ${ageDays} days makes confident assessment difficult.`;
  }
  return `Subject shows a mixed profile over ${ageDays} days. ${postCount} posts with uneven reception.`;
}

function buildWeaknesses(categories: CategoryScore[]): string {
  const weakest = [...categories].sort((a, b) => a.score - b.score)[0];
  return `Weakest dimension: ${weakest.name} (${weakest.score}/100) — ${weakest.topSignal}.`;
}

function buildConcernOpener(profile: AgentProfile, ageDays: number, postCount: number): string {
  return `Concerning patterns detected. Subject has been active for ${ageDays} days with ${postCount} posts.`;
}

function buildPatternAnalysis(ctx: ScoringContext, categories: CategoryScore[]): string {
  const interaction = categories.find((c) => c.name === "Interaction Quality");
  const contentCat = categories.find((c) => c.name === "Content Quality");

  if (interaction && interaction.score < 30) {
    return "Low community engagement suggests bot-like behavior.";
  }
  if (contentCat && contentCat.score < 30) {
    return "Content quality falls well below platform norms.";
  }
  return "Multiple scoring dimensions below acceptable thresholds.";
}

function buildCriticalOpener(flags: string[]): string {
  if (flags.length > 0) {
    return `Multiple red flags. ${flags[0]}.`;
  }
  return "Multiple red flags detected across scoring dimensions.";
}

function buildCriticalEvidence(
  ctx: ScoringContext,
  profile: AgentProfile,
  ageDays: number,
  categories: CategoryScore[]
): string {
  const parts: string[] = [];
  if (profile.karma < 0) parts.push("Negative karma ratio");
  if (ageDays < 7) parts.push(`Account age under 7 days`);

  const risk = categories.find((c) => c.name === "Risk Signals");
  if (risk && risk.score < 50) parts.push(risk.topSignal);

  const postCount = ctx.content.length;
  if (postCount > 20 && ageDays < 7) {
    parts.push("aggressive posting frequency");
  }

  return parts.length > 0 ? parts.join(". ") + "." : "Subject fails multiple trust indicators.";
}

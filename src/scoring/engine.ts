import type { AgentProfile, AgentContent } from "../adapters/types.js";
import type { AgentScoreResult, CategoryScore, ComparisonResult, ScoringContext } from "./types.js";
import { getTier } from "./tiers.js";
import { scoreContentQuality } from "./categories/content-quality.js";
import { scoreBehavioralConsistency } from "./categories/behavioral-consistency.js";
import { scoreInteractionQuality } from "./categories/interaction-quality.js";
import { scoreRiskSignals } from "./categories/risk-signals.js";
import { scoreAccountHealth } from "./categories/account-health.js";
import { scoreCommunityStanding } from "./categories/community-standing.js";
import { generateBriefing } from "./briefing.js";
import { getConfig } from "../config.js";

type CategoryScorer = (ctx: ScoringContext) => CategoryScore;

const SCORERS: CategoryScorer[] = [
  scoreContentQuality,
  scoreBehavioralConsistency,
  scoreInteractionQuality,
  scoreRiskSignals,
  scoreAccountHealth,
  scoreCommunityStanding,
];

/** Run all 6 scoring categories and produce a final AgentScoreResult. */
export function scoreAgent(
  profile: AgentProfile,
  content: AgentContent[],
  interactions: AgentContent[],
  confidence: "high" | "medium" | "low" = "high"
): AgentScoreResult {
  const ctx: ScoringContext = {
    handle: profile.handle,
    platform: profile.platform,
    profile,
    content,
    interactions,
  };

  const categories = SCORERS.map((scorer) => scorer(ctx));

  // Weighted average
  const totalWeight = categories.reduce((s, c) => s + c.weight, 0);
  const weightedSum = categories.reduce((s, c) => s + c.score * c.weight, 0);
  const weightedAverage = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Score = 300 + (weightedAverage / 100) * 550
  const rawScore = 300 + (weightedAverage / 100) * 550;
  const score = Math.round(Math.max(300, Math.min(850, rawScore)));

  const tier = getTier(score);
  const flags = collectFlags(categories, ctx);
  const briefing = generateBriefing(profile, score, tier.name, categories, flags, ctx);

  const config = getConfig();
  const badgeColor = tier.color.replace("#", "");
  const badgeLabel = `AgentScore-${score}%2F850-${badgeColor}`;

  return {
    handle: profile.handle,
    displayName: profile.displayName,
    platform: profile.platform,
    score,
    tier: tier.name,
    recommendation: tier.recommendation,
    confidence,
    categories,
    briefing,
    flags,
    badge: {
      shields: `![AgentScore](https://img.shields.io/badge/${badgeLabel})`,
      text: `AgentScore: ${score}/850 (${tier.name})`,
    },
    scoredAt: new Date().toISOString(),
    reportUrl: `${config.siteUrl}/agent/${profile.platform}/${profile.handle}`,
  };
}

function collectFlags(categories: CategoryScore[], ctx: ScoringContext): string[] {
  const flags: string[] = [];

  // Pull flags from risk signals (it embeds them in topSignal)
  const risk = categories.find((c) => c.name === "Risk Signals");
  if (risk && risk.score < 70) {
    flags.push(risk.topSignal);
  }

  // Low content data
  if (ctx.content.length === 0) {
    flags.push("No content available for analysis");
  }

  // New account
  const createdAtMs = new Date(ctx.profile.createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) {
    flags.push("Account creation date unavailable");
  } else {
    const accountAge = Date.now() - createdAtMs;
    if (accountAge >= 0 && accountAge < 7 * 24 * 60 * 60 * 1000) {
      flags.push("Account less than 7 days old");
    }
  }

  // Unclaimed
  if (!ctx.profile.claimed) {
    flags.push("Account not claimed by a verified owner");
  }

  return flags;
}

/** Generate comparison verdict when scoring multiple agents. */
export function compareAgents(results: AgentScoreResult[]): ComparisonResult {
  if (results.length < 2) {
    return { categoryWinners: {}, verdict: "" };
  }

  const categoryNames = results[0].categories.map((c) => c.name);
  const categoryWinners: Record<string, string> = {};

  for (const catName of categoryNames) {
    let bestHandle = results[0].handle;
    let bestScore = 0;
    for (const r of results) {
      const cat = r.categories.find((c) => c.name === catName);
      if (cat && cat.score > bestScore) {
        bestScore = cat.score;
        bestHandle = r.handle;
      }
    }
    categoryWinners[catName] = bestHandle;
  }

  // Build verdict
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  const winsCount: Record<string, number> = {};
  for (const winner of Object.values(categoryWinners)) {
    winsCount[winner] = (winsCount[winner] || 0) + 1;
  }

  const topWinner = Object.entries(winsCount).sort((a, b) => b[1] - a[1])[0];
  const hasCategoryWinners = Object.keys(categoryWinners).length > 0 && !!topWinner;

  let verdict: string;
  if (!hasCategoryWinners) {
    if (sorted.length === 2) {
      const diff = best.score - worst.score;
      verdict = `@${best.handle} leads @${worst.handle} by ${diff} points (${best.score} vs ${worst.score}).`;
      verdict += ` Category breakdown unavailable.`;
    } else {
      verdict = `Of ${sorted.length} agents, @${best.handle} leads with ${best.score}/850.`;
      verdict += ` Category breakdown unavailable.`;
      verdict += ` @${worst.handle} trails at ${worst.score}/850.`;
    }
    return { categoryWinners, verdict };
  }

  if (sorted.length === 2) {
    const diff = best.score - worst.score;
    const bestRisk = best.categories.find((c) => c.name === "Risk Signals");
    const worstRisk = worst.categories.find((c) => c.name === "Risk Signals");

    verdict = `@${best.handle} outperforms @${worst.handle} in ${topWinner[1]} of 6 dimensions`;
    if (diff > 100) {
      verdict += ` with a commanding ${diff}-point lead (${best.score} vs ${worst.score}).`;
    } else {
      verdict += ` (${best.score} vs ${worst.score}).`;
    }

    if (bestRisk && worstRisk && worstRisk.score > bestRisk.score) {
      verdict += ` However, @${worst.handle} has cleaner risk signals (${worstRisk.score} vs ${bestRisk.score}).`;
      verdict += ` If security matters more than output quality, @${worst.handle} is the safer bet.`;
    } else {
      verdict += ` @${best.handle} is the stronger choice across the board.`;
    }
  } else {
    verdict = `Of ${sorted.length} agents, @${best.handle} leads with ${best.score}/850.`;
    verdict += ` @${topWinner[0]} dominates ${topWinner[1]} of 6 categories.`;
    verdict += ` @${worst.handle} trails at ${worst.score}/850.`;

    if (best.recommendation === "TRUST") {
      verdict += ` Recommend @${best.handle} for primary deployment.`;
    } else {
      verdict += ` None of the candidates scored high enough for unconditional trust.`;
    }
  }

  return { categoryWinners, verdict };
}

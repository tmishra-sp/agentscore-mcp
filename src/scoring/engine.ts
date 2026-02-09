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
  const badgeUrl = `https://img.shields.io/badge/${badgeLabel}`;
  const badgeMarkdown = `![AgentScore](${badgeUrl})`;
  const encodedHandle = encodeURIComponent(profile.handle);
  const scoredAt = new Date().toISOString();
  const reportUrl =
    config.reportUrlMode === "always" ||
    (config.reportUrlMode === "demo-only" && profile.platform === "demo")
      ? `${config.siteUrl}/agent/${encodedHandle}`
      : undefined;
  const governanceCardHtml = buildGovernanceCardHtml({
    profile,
    score,
    tier: tier.name,
    recommendation: tier.recommendation,
    confidence,
    categories,
    flags,
    scoredAt,
    badgeUrl,
  });

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
      url: badgeUrl,
      markdown: badgeMarkdown,
      shields: badgeMarkdown,
      text: `AgentScore: ${score}/850 (${tier.name})`,
    },
    artifacts: {
      governanceCardHtml,
    },
    scoredAt,
    reportUrl,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildGovernanceCardHtml(input: {
  profile: AgentProfile;
  score: number;
  tier: string;
  recommendation: string;
  confidence: string;
  categories: CategoryScore[];
  flags: string[];
  scoredAt: string;
  badgeUrl: string;
}): string {
  const rows = input.categories
    .map(
      (c) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(c.name)}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${c.score}/100</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${c.weight}%</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(c.topSignal)}</td></tr>`
    )
    .join("");
  const flags =
    input.flags.length > 0
      ? escapeHtml(input.flags.join("; "))
      : "None";

  return (
    `<section style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;max-width:860px;` +
    `border:1px solid #d1d5db;border-radius:14px;padding:16px;background:#ffffff;color:#111827;">` +
    `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">` +
    `<div><h2 style="margin:0 0 4px 0;font-size:20px;">Agent Trust Card</h2>` +
    `<div style="font-size:14px;color:#4b5563;">@${escapeHtml(input.profile.handle)} | ${escapeHtml(input.profile.displayName)}</div></div>` +
    `<img alt="AgentScore badge" src="${escapeHtml(input.badgeUrl)}" style="height:28px;" /></div>` +
    `<p style="margin:12px 0 10px 0;font-size:14px;">` +
    `<strong>Score:</strong> ${input.score}/850 (${escapeHtml(input.tier)}) | ` +
    `<strong>Recommendation:</strong> ${escapeHtml(input.recommendation)} | ` +
    `<strong>Confidence:</strong> ${escapeHtml(input.confidence)}</p>` +
    `<table style="width:100%;border-collapse:collapse;font-size:13px;">` +
    `<thead><tr>` +
    `<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #d1d5db;">Dimension</th>` +
    `<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #d1d5db;">Score</th>` +
    `<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #d1d5db;">Weight</th>` +
    `<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #d1d5db;">Top Signal</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>` +
    `<p style="margin:10px 0 0 0;font-size:13px;"><strong>Flags:</strong> ${flags}</p>` +
    `<p style="margin:6px 0 0 0;font-size:12px;color:#6b7280;">Scored at ${escapeHtml(input.scoredAt)}.</p>` +
    `</section>`
  );
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

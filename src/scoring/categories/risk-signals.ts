import type { CategoryScore, ScoringContext } from "../types.js";
import { trigramSimilarity } from "../utils.js";

const MANIPULATION_KEYWORDS = [
  "buy now", "limited time", "act fast", "guaranteed returns", "free money",
  "click here", "make money", "get rich", "dm me", "join my",
  "pump", "moon", "wagmi",
];

const INJECTION_PATTERNS = [
  "ignore previous", "ignore above", "disregard", "you are now",
  "new instructions", "system prompt", "jailbreak", "do anything now", "dan mode",
];

/** Risk Signals — 20% weight. Start at 100, subtract penalties. Higher = safer. */
export function scoreRiskSignals(ctx: ScoringContext): CategoryScore {
  const allContent = [...ctx.content, ...ctx.interactions];
  const flags: string[] = [];
  let score = 100;

  // Spam detection (0-30 penalty): trigram similarity > 0.7 between posts
  if (allContent.length >= 2) {
    let spamPairs = 0;
    let maxSimilarity = 0;
    const sampleSize = Math.min(allContent.length, 20);
    for (let i = 0; i < sampleSize; i++) {
      for (let j = i + 1; j < sampleSize; j++) {
        const sim = trigramSimilarity(allContent[i].content, allContent[j].content);
        maxSimilarity = Math.max(maxSimilarity, sim);
        if (sim > 0.7) spamPairs++;
      }
    }
    if (spamPairs > 0) {
      const penalty = Math.min(30, spamPairs * 6);
      score -= penalty;
      flags.push(`${Math.round(maxSimilarity * 100)}% content similarity detected across ${spamPairs} post pairs`);
    }
  }

  // Manipulation keywords (0-20 penalty)
  const allText = allContent.map((c) => c.content.toLowerCase()).join(" ");
  const foundKeywords = MANIPULATION_KEYWORDS.filter((kw) => allText.includes(kw));
  if (foundKeywords.length > 0) {
    const penalty = Math.min(20, foundKeywords.length * 5);
    score -= penalty;
    flags.push(`${foundKeywords.length} manipulation keyword(s): ${foundKeywords.join(", ")}`);
  }

  // Negative karma (0-25 penalty)
  if (ctx.profile.karma < 0) {
    score -= 25;
    flags.push("Negative karma");
  } else if (ctx.profile.karma < 10) {
    score -= 10;
    flags.push("Very low karma");
  }

  // Prompt injection (0-25 penalty)
  const foundInjections = INJECTION_PATTERNS.filter((pat) => allText.includes(pat));
  if (foundInjections.length > 0) {
    const penalty = Math.min(25, foundInjections.length * 8);
    score -= penalty;
    flags.push(`Prompt injection language detected: "${foundInjections[0]}"`);
  }

  score = Math.max(0, score);

  const topSignal =
    flags.length > 0
      ? flags[0]
      : score === 100
        ? "Clean record — zero risk signals"
        : "Minor risk indicators present";

  return { name: "Risk Signals", score: Math.round(score), weight: 20, topSignal };
}

/** Exported for use by sweep tool. */
export { MANIPULATION_KEYWORDS, INJECTION_PATTERNS };

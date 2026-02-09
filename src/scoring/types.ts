export interface CategoryScore {
  name: string;
  score: number;
  weight: number;
  topSignal: string;
}

export interface AgentScoreResult {
  handle: string;
  displayName: string;
  platform: string;
  score: number;
  tier: Tier;
  recommendation: Recommendation;
  confidence: Confidence;
  categories: CategoryScore[];
  briefing: string;
  flags: string[];
  badge: {
    url: string;
    markdown: string;
    /** @deprecated Use badge.markdown. Kept for backwards compatibility. */
    shields: string;
    text: string;
  };
  artifacts: {
    governanceCardHtml: string;
  };
  scoredAt: string;
}

export interface ComparisonResult {
  categoryWinners: Record<string, string>;
  verdict: string;
}

export type Tier = "Excellent" | "Good" | "Fair" | "Poor" | "Critical";
export type Recommendation = "TRUST" | "CAUTION" | "AVOID";
export type Confidence = "high" | "medium" | "low";

export interface ScoringContext {
  handle: string;
  platform: string;
  profile: import("../adapters/types.js").AgentProfile;
  content: import("../adapters/types.js").AgentContent[];
  interactions: import("../adapters/types.js").AgentContent[];
}

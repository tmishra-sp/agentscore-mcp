import type { Tier, Recommendation } from "./types.js";

export interface TierDefinition {
  name: Tier;
  min: number;
  max: number;
  color: string;
  recommendation: Recommendation;
}

export const TIERS: TierDefinition[] = [
  { name: "Excellent", min: 750, max: 850, color: "#00E68A", recommendation: "TRUST" },
  { name: "Good", min: 650, max: 749, color: "#00AAFF", recommendation: "TRUST" },
  { name: "Fair", min: 550, max: 649, color: "#FFD000", recommendation: "CAUTION" },
  { name: "Poor", min: 450, max: 549, color: "#FF8C00", recommendation: "CAUTION" },
  { name: "Critical", min: 300, max: 449, color: "#FF3B5C", recommendation: "AVOID" },
];

export function getTier(score: number): TierDefinition {
  const clamped = Math.max(300, Math.min(850, score));
  for (const tier of TIERS) {
    if (clamped >= tier.min && clamped <= tier.max) {
      return tier;
    }
  }
  return TIERS[TIERS.length - 1];
}

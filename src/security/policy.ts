import type { AgentScoreResult, Recommendation } from "../scoring/types.js";
import { appendPolicyAuditEvent } from "./audit-store.js";
import type { PolicyAuditEvent } from "./audit-store.js";

export interface PolicyConfig {
  enforce: boolean;
  minScore: number;
  blockedRecommendations: Recommendation[];
  blockedThreatLevels: Array<"SUSPICIOUS" | "COMPROMISED">;
  blockedFlagPatterns: string[];
  trustedAdapters: string[];
  failOnErrors: boolean;
  auditLog: boolean;
}

export interface PolicyGateResult {
  enforced: boolean;
  blocked: boolean;
  reasons: string[];
  policy: {
    minScore: number;
    blockedRecommendations: Recommendation[];
    blockedThreatLevels: Array<"SUSPICIOUS" | "COMPROMISED">;
    blockedFlagPatterns: string[];
    trustedAdapters: string[];
    failOnErrors: boolean;
  };
}

interface AgentPolicyInput {
  adapter: string;
  results: AgentScoreResult[];
  errorsCount: number;
}

interface SweepPolicyInput {
  adapter: string;
  threatLevel: "CLEAN" | "SUSPICIOUS" | "COMPROMISED";
  participants: Array<{ handle: string; score: number }>;
  patterns: string[];
  notes?: string[];
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseThreatLevels(raw: string[]): Array<"SUSPICIOUS" | "COMPROMISED"> {
  const allowed = new Set(["SUSPICIOUS", "COMPROMISED"]);
  const out: Array<"SUSPICIOUS" | "COMPROMISED"> = [];
  for (const item of raw) {
    const upper = item.toUpperCase();
    if (allowed.has(upper)) {
      out.push(upper as "SUSPICIOUS" | "COMPROMISED");
    }
  }
  return out;
}

function normalizeScore(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw || "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(300, Math.min(850, parsed));
}

export function readPolicyConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PolicyConfig {
  const enforce = parseBool(env.AGENTSCORE_ENFORCE, false);
  const minScore = normalizeScore(env.AGENTSCORE_POLICY_MIN_SCORE, 550);

  const blockedRecommendations = parseList(env.AGENTSCORE_POLICY_BLOCK_RECOMMENDATIONS)
    .map((value) => value.toUpperCase())
    .filter((value): value is Recommendation => ["TRUST", "CAUTION", "AVOID"].includes(value));

  const effectiveBlockedRecommendations: Recommendation[] =
    blockedRecommendations.length > 0 ? blockedRecommendations : ["AVOID"];

  const blockedThreatLevels = parseThreatLevels(parseList(env.AGENTSCORE_POLICY_BLOCK_THREAT_LEVELS));
  const effectiveBlockedThreatLevels: Array<"SUSPICIOUS" | "COMPROMISED"> =
    blockedThreatLevels.length > 0 ? blockedThreatLevels : ["COMPROMISED"];

  const blockedFlagPatterns = parseList(env.AGENTSCORE_POLICY_BLOCK_FLAGS).map((value) => value.toLowerCase());
  const effectiveBlockedFlagPatterns =
    blockedFlagPatterns.length > 0
      ? blockedFlagPatterns
      : ["prompt injection", "manipulation keyword", "account not claimed"];

  const trustedAdapters = parseList(env.AGENTSCORE_POLICY_TRUSTED_ADAPTERS).map((value) =>
    value.toLowerCase()
  );

  const effectiveTrustedAdapters =
    trustedAdapters.length > 0 ? trustedAdapters : enforce ? ["github", "json", "moltbook"] : [];

  return {
    enforce,
    minScore,
    blockedRecommendations: effectiveBlockedRecommendations,
    blockedThreatLevels: effectiveBlockedThreatLevels,
    blockedFlagPatterns: effectiveBlockedFlagPatterns,
    trustedAdapters: effectiveTrustedAdapters,
    failOnErrors: parseBool(env.AGENTSCORE_POLICY_FAIL_ON_ERRORS, false),
    auditLog: parseBool(env.AGENTSCORE_AUDIT_LOG, enforce),
  };
}

function buildPolicyGate(config: PolicyConfig, reasons: string[]): PolicyGateResult {
  return {
    enforced: config.enforce,
    blocked: config.enforce && reasons.length > 0,
    reasons: [...new Set(reasons)],
    policy: {
      minScore: config.minScore,
      blockedRecommendations: config.blockedRecommendations,
      blockedThreatLevels: config.blockedThreatLevels,
      blockedFlagPatterns: config.blockedFlagPatterns,
      trustedAdapters: config.trustedAdapters,
      failOnErrors: config.failOnErrors,
    },
  };
}

export function evaluateAgentPolicy(input: AgentPolicyInput, config: PolicyConfig): PolicyGateResult {
  const reasons: string[] = [];

  if (!config.enforce) return buildPolicyGate(config, reasons);

  if (config.trustedAdapters.length > 0 && !config.trustedAdapters.includes(input.adapter.toLowerCase())) {
    reasons.push(`Adapter '${input.adapter}' is not in trusted adapters list.`);
  }

  for (const result of input.results) {
    if (result.score < config.minScore) {
      reasons.push(`@${result.handle} scored ${result.score}, below minimum policy score ${config.minScore}.`);
    }

    if (config.blockedRecommendations.includes(result.recommendation)) {
      reasons.push(`@${result.handle} recommendation is ${result.recommendation}, which is blocked by policy.`);
    }

    const loweredFlags = result.flags.map((flag) => flag.toLowerCase());
    for (const pattern of config.blockedFlagPatterns) {
      if (loweredFlags.some((flag) => flag.includes(pattern))) {
        reasons.push(`@${result.handle} matched blocked flag pattern '${pattern}'.`);
      }
    }
  }

  if (config.failOnErrors && input.errorsCount > 0) {
    reasons.push(`Policy configured to fail on scoring errors; observed ${input.errorsCount} error(s).`);
  }

  return buildPolicyGate(config, reasons);
}

export function evaluateSweepPolicy(input: SweepPolicyInput, config: PolicyConfig): PolicyGateResult {
  const reasons: string[] = [];

  if (!config.enforce) return buildPolicyGate(config, reasons);

  if (config.trustedAdapters.length > 0 && !config.trustedAdapters.includes(input.adapter.toLowerCase())) {
    reasons.push(`Adapter '${input.adapter}' is not in trusted adapters list.`);
  }

  if (config.blockedThreatLevels.includes(input.threatLevel as "SUSPICIOUS" | "COMPROMISED")) {
    reasons.push(`Threat level ${input.threatLevel} is blocked by policy.`);
  }

  if (input.participants.length > 0) {
    const avgScore =
      input.participants.reduce((sum, participant) => sum + participant.score, 0) / input.participants.length;
    if (avgScore < config.minScore) {
      reasons.push(`Participant average score ${Math.round(avgScore)} is below minimum ${config.minScore}.`);
    }
  }

  const matchedFlags = [...input.patterns, ...(input.notes || [])].map((value) => value.toLowerCase());
  for (const pattern of config.blockedFlagPatterns) {
    if (matchedFlags.some((item) => item.includes(pattern))) {
      reasons.push(`Sweep matched blocked pattern '${pattern}'.`);
    }
  }

  return buildPolicyGate(config, reasons);
}

export function emitPolicyAudit(tool: "agentscore" | "sweep", gate: PolicyGateResult, metadata: Record<string, unknown>, config: PolicyConfig): void {
  if (!config.auditLog) return;
  const event: PolicyAuditEvent = {
    ts: new Date().toISOString(),
    type: "agentscore_policy_decision",
    tool,
    enforced: gate.enforced,
    blocked: gate.blocked,
    reasons: gate.reasons,
    policy: gate.policy,
    metadata,
  };
  appendPolicyAuditEvent(event);
  console.error(`[agentscore][audit] ${JSON.stringify(event)}`);
}

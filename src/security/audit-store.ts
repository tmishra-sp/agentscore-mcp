export interface PolicyAuditEvent {
  ts: string;
  type: "agentscore_policy_decision";
  tool: "agentscore" | "sweep";
  enforced: boolean;
  blocked: boolean;
  reasons: string[];
  policy: {
    minScore: number;
    blockedRecommendations: Array<"TRUST" | "CAUTION" | "AVOID">;
    blockedThreatLevels: Array<"SUSPICIOUS" | "COMPROMISED">;
    blockedFlagPatterns: string[];
    trustedAdapters: string[];
    failOnErrors: boolean;
  };
  metadata: Record<string, unknown>;
}

const events: PolicyAuditEvent[] = [];
let maxEntries = 500;

export function setAuditStoreMaxEntries(value: number): void {
  if (!Number.isFinite(value)) return;
  maxEntries = Math.max(10, Math.min(10_000, Math.trunc(value)));
  if (events.length > maxEntries) {
    events.splice(0, events.length - maxEntries);
  }
}

export function appendPolicyAuditEvent(event: PolicyAuditEvent): void {
  events.push(event);
  if (events.length > maxEntries) {
    events.splice(0, events.length - maxEntries);
  }
}

export function listPolicyAuditEvents(options?: {
  limit?: number;
  tool?: "agentscore" | "sweep";
  blocked?: boolean;
}): PolicyAuditEvent[] {
  const limit = options?.limit ? Math.max(1, Math.min(options.limit, 1000)) : 100;
  const filtered = events.filter((event) => {
    if (options?.tool && event.tool !== options.tool) return false;
    if (options?.blocked !== undefined && event.blocked !== options.blocked) return false;
    return true;
  });
  return filtered.slice(Math.max(0, filtered.length - limit));
}

export function getPolicyAuditStats(): {
  total: number;
  blocked: number;
  allowed: number;
  byTool: {
    agentscore: number;
    sweep: number;
  };
} {
  let blocked = 0;
  let agentscore = 0;
  let sweep = 0;
  for (const event of events) {
    if (event.blocked) blocked++;
    if (event.tool === "agentscore") agentscore++;
    else sweep++;
  }
  return {
    total: events.length,
    blocked,
    allowed: events.length - blocked,
    byTool: {
      agentscore,
      sweep,
    },
  };
}

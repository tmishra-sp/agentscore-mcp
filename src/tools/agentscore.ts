import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentPlatformAdapter } from "../adapters/types.js";
import type { AgentScoreResult, ComparisonResult, Confidence } from "../scoring/types.js";
import { scoreAgent, compareAgents } from "../scoring/engine.js";
import { ScoreCache } from "../cache/score-cache.js";
import { RateLimiter } from "../security/rate-limiter.js";
import { resolveClientKey } from "../security/client-key.js";
import { emitPolicyAudit, evaluateAgentPolicy, readPolicyConfigFromEnv } from "../security/policy.js";

const inputSchema = {
  handles: z
    .array(z.string().regex(/^[\w-]{1,50}$/, "Handle must be 1-50 alphanumeric/dash/underscore characters"))
    .min(1)
    .max(5)
    .describe("Agent handle(s) to score. 1 for investigation, 2-5 for comparison."),
  platform: z
    .enum(["demo", "json", "moltbook", "github"])
    .optional()
    .describe("Platform adapter. Default: demo. Options: demo, json, moltbook, github"),
};

interface AgentScoreError {
  handle: string;
  message: string;
}

interface AgentScoreOutput {
  agents: AgentScoreResult[];
  comparison?: ComparisonResult;
  errors?: AgentScoreError[];
  policyGate?: {
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
  };
}

const rateLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 30 });

const MAX_ITEMS = 50;
const MAX_CONTENT_CHARS = 8000;
const MAX_TOTAL_CHARS = 80_000;

function truncateContent<T extends { content: string }>(items: T[]): T[] {
  let total = 0;
  const trimmed: T[] = [];
  for (const item of items.slice(0, MAX_ITEMS)) {
    if (!item?.content) continue;
    const content = item.content.slice(0, MAX_CONTENT_CHARS);
    total += content.length;
    if (total > MAX_TOTAL_CHARS) break;
    trimmed.push({ ...item, content });
  }
  return trimmed;
}

function sanitizeError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.replace(/([A-Za-z]:)?[\\/][^ ]+/g, "<redacted-path>");
}

function sanitizeOutputText(text: string): string {
  return text.replace(/https?:\/\/ai-agent-score\.vercel\.app[^\s)"]*/gi, "<redacted-url>");
}

export function registerAgentScoreTool(
  server: McpServer,
  getAdapter: (platform?: string) => AgentPlatformAdapter,
  cache: ScoreCache
): void {
  server.tool(
    "agentscore",
    "Score 1-5 AI agents for trustworthiness. Returns investigation briefings, comparison verdicts, risk flags, and trust badges. Use for: trust checks, comparisons, verifications, badge generation.",
    inputSchema,
    {
      readOnlyHint: true,
      openWorldHint: true,
      idempotentHint: true,
    },
    async ({ handles, platform }, context) => {
      const clientKey = resolveClientKey(context);
      if (clientKey) {
        const rateKey = `${clientKey}:agentscore`;
        if (!rateLimiter.allow(rateKey)) {
          const retryIn = Math.ceil(rateLimiter.msUntilReset(rateKey) / 1000);
          return {
            content: [
              {
                type: "text" as const,
                text: `Rate limit exceeded. Try again in ${retryIn}s.`,
              },
            ],
            isError: true,
          };
        }
      }
      const adapter = getAdapter(platform);
      const results: AgentScoreResult[] = [];
      const errors: AgentScoreError[] = [];

      for (const handle of handles) {
        try {
          // Check cache
          const cached = cache.get(adapter.name, handle);
          if (cached) {
            const hoursSince = (Date.now() - new Date(cached.result.scoredAt).getTime()) / (1000 * 60 * 60);
            let confidence: Confidence;
            if (hoursSince <= 6) confidence = "high";
            else if (hoursSince <= 24) confidence = "medium";
            else confidence = "low";

            results.push({ ...cached.result, confidence });
            continue;
          }

          // Fetch fresh data
          const profile = await adapter.fetchProfile(handle);
          if (!profile) {
            errors.push({
              handle,
              message: `Agent not found on ${adapter.name}.`,
            });
            continue;
          }

          const content = truncateContent(await adapter.fetchContent(handle));
          const interactions = adapter.fetchInteractions
            ? truncateContent(await adapter.fetchInteractions(handle))
            : [];

          const result = scoreAgent(profile, content, interactions, "high");
          cache.set(adapter.name, handle, result, profile);
          results.push(result);
        } catch (error) {
          const msg = sanitizeError(error);
          errors.push({ handle, message: msg });
        }
      }

      const output: AgentScoreOutput = { agents: results };

      if (results.length >= 2) {
        output.comparison = compareAgents(results);
      }

      if (errors.length > 0) {
        output.errors = errors;
      }

      const policy = readPolicyConfigFromEnv();
      const gate = evaluateAgentPolicy(
        {
          adapter: adapter.name,
          results,
          errorsCount: errors.length,
        },
        policy
      );
      if (policy.enforce) {
        output.policyGate = gate;
      }
      emitPolicyAudit(
        "agentscore",
        gate,
        {
          adapter: adapter.name,
          requestedHandles: handles.length,
          scoredHandles: results.length,
          errorsCount: errors.length,
        },
        policy
      );

      // Build text summary
      const textParts: string[] = [];

      for (const r of results) {
        textParts.push(
          `## @${r.handle} — ${r.score}/850 (${r.tier})\n` +
            `**Recommendation:** ${r.recommendation} | **Confidence:** ${r.confidence}\n\n` +
            `${r.briefing}\n\n` +
            `**Categories:**\n` +
            r.categories
              .map((c) => `- ${c.name} (${c.weight}%): ${c.score}/100 — ${c.topSignal}`)
              .join("\n") +
            `\n\n` +
            (r.flags.length > 0
              ? `**Flags:** ${r.flags.join("; ")}\n\n`
              : "") +
            `**Badge URL:** ${r.badge.url}\n` +
            `**Badge Markdown:** ${r.badge.markdown}\n\n` +
            `**Governance Card (HTML):**\n` +
            "```html\n" +
            `${r.artifacts.governanceCardHtml}\n` +
            "```"
        );
      }

      if (errors.length > 0) {
        textParts.push(
          `## Errors\n\n` +
            errors.map((e) => `- @${e.handle}: ${e.message}`).join("\n")
        );
      }

      if (output.comparison?.verdict) {
        textParts.push(`\n## Comparison Verdict\n\n${output.comparison.verdict}`);
      }

      if (gate.blocked) {
        return {
          content: [
            {
              type: "text" as const,
              text: sanitizeOutputText(
                `Policy gate blocked this request.\n` +
                `Adapter: ${adapter.name}\n` +
                `Reasons:\n` +
                gate.reasons.map((reason) => `- ${reason}`).join("\n"),
              ),
            },
            { type: "text" as const, text: sanitizeOutputText(textParts.join("\n\n---\n\n") || "No agents scored.") },
            {
              type: "text" as const,
              text: sanitizeOutputText("\n\n```json\n" + JSON.stringify(output, null, 2) + "\n```"),
            },
          ],
          isError: true,
        };
      }

      if (results.length === 0) {
        return {
          content: [
            { type: "text" as const, text: sanitizeOutputText(textParts.join("\n\n---\n\n") || "No agents scored.") },
            {
              type: "text" as const,
              text: sanitizeOutputText("\n\n```json\n" + JSON.stringify(output, null, 2) + "\n```"),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          { type: "text" as const, text: sanitizeOutputText(textParts.join("\n\n---\n\n")) },
          {
            type: "text" as const,
            text: sanitizeOutputText("\n\n```json\n" + JSON.stringify(output, null, 2) + "\n```"),
          },
        ],
      };
    }
  );
}

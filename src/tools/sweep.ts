import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentPlatformAdapter } from "../adapters/types.js";
import { scoreAgent } from "../scoring/engine.js";
import { trigramSimilarity } from "../scoring/utils.js";
import { ScoreCache } from "../cache/score-cache.js";
import { RateLimiter } from "../security/rate-limiter.js";

const inputSchema = {
  threadId: z
    .string()
    .regex(/^[\w\-\/:.]{1,200}$/, "Thread ID must be 1-200 valid characters")
    .describe("Thread or post ID to analyze for manipulation patterns."),
  platform: z
    .enum(["demo", "json", "moltbook", "github"])
    .optional()
    .describe("Platform adapter. Default: demo. Options: demo, json, moltbook, github"),
};

type ThreatLevel = "CLEAN" | "SUSPICIOUS" | "COMPROMISED";

interface SweepParticipant {
  handle: string;
  score: number;
  tier: string;
  role: "author" | "participant";
}

interface SweepOutput {
  threadId: string;
  platform: string;
  participantCount: number;
  participants: SweepParticipant[];
  threatLevel: ThreatLevel;
  patterns: string[];
  briefing: string;
}

const rateLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 10 });

const MAX_ITEMS = 200;
const MAX_CONTENT_CHARS = 8000;
const MAX_TOTAL_CHARS = 160_000;

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

export function registerSweepTool(
  server: McpServer,
  getAdapter: (platform?: string) => AgentPlatformAdapter,
  cache: ScoreCache
): void {
  server.tool(
    "sweep",
    "Analyze a thread or conversation for manipulation patterns. Detects coordinated bots, sock puppets, and astroturfing campaigns by scoring every participant and checking for content similarity, timing anomalies, and amplification signals.",
    inputSchema,
    {
      readOnlyHint: true,
      openWorldHint: true,
      idempotentHint: true,
    },
    async ({ threadId, platform }, context) => {
      const clientKey = context?.sessionId || "anonymous";
      const rateKey = `${clientKey}:sweep`;
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
      const adapter = getAdapter(platform);

      // Check if adapter supports thread operations
      if (!adapter.fetchThreadContent || !adapter.fetchThreadParticipants) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `Thread analysis requires fetchThreadContent() and fetchThreadParticipants() methods, ` +
                `which the ${adapter.name} adapter doesn't implement yet. ` +
                `See examples/custom-adapter.ts for implementation guidance.`,
            },
          ],
          isError: true,
        };
      }

      try {
        // 1. Fetch thread content
        const threadContent = truncateContent(await adapter.fetchThreadContent(threadId));
        if (threadContent.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Thread not found on ${adapter.name}.`,
              },
            ],
            isError: true,
          };
        }

        // 2. Fetch thread participants from adapter
        const participantProfiles = await adapter.fetchThreadParticipants(threadId);
        if (participantProfiles.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No participants found for thread on ${adapter.name}.`,
              },
            ],
            isError: true,
          };
        }

        // 3. Score each participant
        const participants: SweepParticipant[] = [];
        const scores: number[] = [];

        for (const profile of participantProfiles) {
          const cached = cache.get(adapter.name, profile.handle);
          let score: number;
          let tier: string;

          if (cached) {
            score = cached.result.score;
            tier = cached.result.tier;
          } else {
            const content = truncateContent(await adapter.fetchContent(profile.handle));
            const interactions = adapter.fetchInteractions
              ? truncateContent(await adapter.fetchInteractions(profile.handle))
              : [];
            const result = scoreAgent(profile, content, interactions);
            cache.set(adapter.name, profile.handle, result, profile);
            score = result.score;
            tier = result.tier;
          }

          scores.push(score);
          participants.push({
            handle: profile.handle,
            score,
            tier,
            role: participants.length === 0 ? "author" : "participant",
          });
        }

        // 4. Run coordination analysis
        const patterns: string[] = [];
        let coordinationSignals = 0;

        // a. Content similarity between all participant pairs
        if (threadContent.length >= 2) {
          const highSimPairs: string[] = [];
          let maxSim = 0;
          for (let i = 0; i < threadContent.length; i++) {
            for (let j = i + 1; j < threadContent.length; j++) {
              const sim = trigramSimilarity(threadContent[i].content, threadContent[j].content);
              maxSim = Math.max(maxSim, sim);
              if (sim > 0.7) {
                highSimPairs.push(`${i}-${j}`);
              }
            }
          }
          if (highSimPairs.length > 0) {
            patterns.push(
              `Content similarity >70% detected in ${highSimPairs.length} pairs (max: ${Math.round(maxSim * 100)}%)`
            );
            coordinationSignals++;
          }
        }

        // b. Timing analysis: responses within 10 seconds
        const timestamps = threadContent
          .map((c) => new Date(c.createdAt).getTime())
          .filter((t) => Number.isFinite(t))
          .sort((a, b) => a - b);

        if (timestamps.length >= 2) {
          let rapidResponses = 0;
          for (let i = 1; i < timestamps.length; i++) {
            if (timestamps[i] - timestamps[i - 1] < 10000) {
              rapidResponses++;
            }
          }
          if (rapidResponses >= 2) {
            patterns.push(
              `${rapidResponses} responses within 10 seconds of each other — suspicious timing`
            );
            coordinationSignals++;
          }
        }

        // c. Amplification: low-trust agents (<500) agreeing with same entity
        const lowTrustCount = scores.filter((s) => s < 500).length;
        if (lowTrustCount >= 3) {
          patterns.push(
            `${lowTrustCount} participants scored below 500 — potential amplification network`
          );
          coordinationSignals++;
        }

        // d. Echo detection: content fingerprint overlap > 60%
        if (threadContent.length >= 3) {
          const fingerprints = threadContent.map((c) => c.content);
          let echoCount = 0;
          for (let i = 0; i < fingerprints.length; i++) {
            for (let j = i + 1; j < fingerprints.length; j++) {
              if (trigramSimilarity(fingerprints[i], fingerprints[j]) > 0.6) {
                echoCount++;
              }
            }
          }
          if (echoCount >= 3) {
            patterns.push(
              `Echo chamber detected: ${echoCount} content pairs with >60% overlap — likely same controller`
            );
            coordinationSignals++;
          }
        }

        // Determine threat level
        let threatLevel: ThreatLevel;
        const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

        if (coordinationSignals >= 3 || patterns.some((p) => p.includes("same controller"))) {
          threatLevel = "COMPROMISED";
        } else if (coordinationSignals >= 1 || avgScore < 500) {
          threatLevel = "SUSPICIOUS";
        } else {
          threatLevel = "CLEAN";
        }

        // Generate briefing
        const briefing = generateSweepBriefing(
          threadId,
          participants,
          threatLevel,
          patterns,
          avgScore
        );

        const output: SweepOutput = {
          threadId,
          platform: adapter.name,
          participantCount: participants.length,
          participants,
          threatLevel,
          patterns,
          briefing,
        };

        const text =
          `## Thread Sweep: ${threadId}\n\n` +
          `**Threat Level:** ${threatLevel}\n` +
          `**Participants:** ${participants.length}\n\n` +
          `${briefing}\n\n` +
          (patterns.length > 0
            ? `**Patterns Detected:**\n${patterns.map((p) => `- ${p}`).join("\n")}\n\n`
            : "") +
          `**Participant Scores:**\n` +
          participants
            .map((p) => `- @${p.handle}: ${p.score}/850 (${p.tier}) [${p.role}]`)
            .join("\n");

        return {
          content: [
            { type: "text" as const, text },
            { type: "text" as const, text: "\n\n```json\n" + JSON.stringify(output, null, 2) + "\n```" },
          ],
        };
      } catch (error) {
        const msg = sanitizeError(error);
        return {
          content: [
            { type: "text" as const, text: `Error sweeping thread: ${msg}` },
          ],
          isError: true,
        };
      }
    }
  );
}

function generateSweepBriefing(
  threadId: string,
  participants: SweepParticipant[],
  threatLevel: ThreatLevel,
  patterns: string[],
  avgScore: number
): string {
  const count = participants.length;

  if (threatLevel === "CLEAN") {
    return (
      `Thread appears organic. ${count} participants, average trust score ${Math.round(avgScore)}. ` +
      `No timing anomalies, content diversity is healthy. Conversation is genuine.`
    );
  }

  if (threatLevel === "COMPROMISED") {
    const lowTrust = participants.filter((p) => p.score < 400);
    const parts: string[] = [];
    parts.push(`Thread integrity compromised.`);

    if (lowTrust.length > 0) {
      parts.push(
        `${lowTrust.length} of ${count} participants scored below 400.`
      );
    }

    if (patterns.length > 0) {
      parts.push(patterns[0] + ".");
    }

    parts.push("This is an orchestrated amplification campaign.");
    return parts.join(" ");
  }

  // SUSPICIOUS
  const parts: string[] = [];
  parts.push(`Thread shows suspicious indicators.`);
  parts.push(`${count} participants with average score ${Math.round(avgScore)}.`);

  if (patterns.length > 0) {
    parts.push(patterns[0] + ".");
  }

  parts.push("Further investigation recommended.");
  return parts.join(" ");
}

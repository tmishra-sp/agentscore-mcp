import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RateLimiter } from "../security/rate-limiter.js";
import { resolveClientKey } from "../security/client-key.js";
import { classifyInstructionalText } from "./classifier.js";
import { buildRenderedPreview, resolveFormat, runAllDetectors } from "./detectors.js";
import type { Finding, RawFinding, ResolvedXrayFormat, Severity, ThreatLevel, XrayResult } from "./types.js";

const inputSchema = {
  content: z
    .string()
    .describe("The raw content to x-ray. Paste the full text of any file, document, or response."),
  source: z
    .string()
    .optional()
    .describe("Optional source context (for example: README.md, skill-file.md, API response)."),
  format: z
    .enum(["auto", "markdown", "html", "code", "text"])
    .default("auto")
    .describe("Format hint. Default auto-detects from content."),
};

const rateLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 20 });

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

const REFERENCES = [
  "Zack Korman skill file attack (Feb 2, 2026)",
  "CopyPasta virus disclosure (HiddenLayer, 2025)",
  "CVE-2025-53773 (GitHub Copilot prompt injection, CVSS 9.6)",
  "ZombieAgent disclosure (Radware, Jan 2026)",
  "Chameleon's Trap report (StrongestLayer, Sep 2025)",
  "OWASP LLM01:2025 Prompt Injection",
];

function higherSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function determineThreatLevel(findings: Finding[]): ThreatLevel {
  if (findings.length === 0) return "CLEAN";
  const severities = findings.map((f) => f.severity);
  if (severities.includes("critical")) return "CRITICAL";
  if (severities.includes("high")) return "DANGEROUS";
  if (severities.includes("medium")) return "SUSPICIOUS";
  return "INFO";
}

function resolveFinalSeverity(raw: RawFinding): Severity {
  const classification = classifyInstructionalText(raw.hiddenContent, raw.visibility);
  raw.matchedPatterns = classification.matchedGroups;
  raw.matchedPatternCount = classification.matchedPatternCount;

  if (raw.category === "encoding" && !classification.isInstructional) {
    return "info";
  }

  if (raw.category === "code_comment" && !classification.isInstructional) {
    return "info";
  }

  if (
    raw.category === "structural" &&
    !classification.isInstructional &&
    !raw.technique.includes("Script tag") &&
    !raw.technique.includes("<iframe>/<object>")
  ) {
    return "info";
  }

  if (raw.category === "css_hiding" && !classification.isInstructional) {
    return "info";
  }

  if (raw.category === "unicode") {
    return raw.baseSeverity;
  }

  if (raw.visibility === "hidden" && !classification.isInstructional) {
    if (raw.baseSeverity === "critical" || raw.baseSeverity === "medium") return raw.baseSeverity;
    return "info";
  }

  return higherSeverity(raw.baseSeverity, classification.severity);
}

function shouldKeepFinding(raw: RawFinding, severity: Severity): boolean {
  if (raw.category === "code_comment" && severity === "info") return false;
  if (raw.category === "encoding" && severity === "info") return false;
  if (raw.category === "structural" && severity === "info" && !raw.technique.includes("Script tag") && !raw.technique.includes("<iframe>/<object>")) {
    return false;
  }
  return true;
}

function buildSummary(level: ThreatLevel, count: number, techniques: number): string {
  if (level === "CLEAN") return "No hidden AI-targeted payloads detected.";
  return `${count} finding(s) across ${techniques} concealment technique(s). Threat level: ${level}.`;
}

function severityIcon(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "🔴";
    case "high":
      return "🟠";
    case "medium":
      return "🟡";
    case "low":
      return "🔵";
    default:
      return "🟢";
  }
}

function buildRecommendations(level: ThreatLevel, findings: Finding[]): string[] {
  if (level === "CLEAN") {
    return [
      "No hidden instructional payloads were detected.",
      "Continue normal review for visible-content prompt injection and policy checks.",
    ];
  }

  const hasExecution = findings.some((f) => f.matchedPatterns.includes("command_execution"));
  const hasExfil = findings.some((f) => f.matchedPatterns.includes("data_exfiltration"));

  const recommendations: string[] = [
    "Do not allow autonomous agent execution against this content until flagged lines are remediated.",
    "Remove or neutralize hidden payloads and re-run xray before use.",
  ];

  if (hasExecution) {
    recommendations.push("Block command execution paths (for example curl/wget shell pipelines) in downstream agent policy.");
  }
  if (hasExfil) {
    recommendations.push("Treat credentials and tokens as exposed risk; rotate sensitive secrets if this content was already consumed.");
  }
  recommendations.push("Investigate adjacent files/content from the same source for repeated concealment patterns.");
  return recommendations;
}

function buildNarrative(result: XrayResult): string {
  if (result.threatLevel === "CLEAN") {
    return (
      `Content X-Ray: ${result.source}\n` +
      `Threat Level: CLEAN\n\n` +
      `No hidden payloads detected.\n\n` +
      `This content appears safe for agent consumption.`
    );
  }

  const topFindings = result.findings.slice(0, 8);
  const payloadPreview = result.renderedVsRaw.hiddenPayloads
    .slice(0, 3)
    .map((payload, idx) => `${idx + 1}. ${payload.replace(/\s+/g, " ").slice(0, 160)}`)
    .join("\n");

  const renderedPreview = result.renderedVsRaw.renderedPreview.replace(/\s+/g, " ").slice(0, 240);

  return (
    `Content X-Ray: ${result.source}\n` +
    `Threat Level: ${result.threatLevel} — ${result.summary}\n\n` +
    `Found ${result.findings.length} finding(s) using ${result.stats.uniqueTechniques} technique(s).\n\n` +
    topFindings
      .map((finding) => {
        const patterns = finding.matchedPatterns.length > 0 ? finding.matchedPatterns.join(", ") : "none";
        return (
          `${severityIcon(finding.severity)} ${finding.severity.toUpperCase()} [${finding.id}] ` +
          `${finding.title} (line ${finding.location.line})\n` +
          `   Technique: ${finding.technique}\n` +
          `   Hidden payload: "${finding.hiddenContent}"\n` +
          `   Matched: ${patterns}`
        );
      })
      .join("\n\n") +
    `\n\n━━━ What the human sees vs what the AI sees ━━━\n` +
    `HUMAN sees: ${renderedPreview || "(content mostly hidden)"}\n` +
    `AI sees: ${payloadPreview || "(no extracted hidden payload text)"}\n\n` +
    `Recommendations:\n` +
    result.recommendations.map((item, idx) => `${idx + 1}. ${item}`).join("\n") +
    `\n\nReferences: ${result.references.join("; ")}`
  );
}

function normalizeSource(source: string | undefined): string {
  const value = (source || "").trim();
  return value || "content-input";
}

function computeHiddenCharacterCount(findings: Finding[]): number {
  return findings
    .filter((f) => f.severity !== "info" || f.category === "html_comment" || f.category === "unicode")
    .reduce((sum, finding) => sum + finding.hiddenContent.length, 0);
}

export function registerXrayTool(server: McpServer): void {
  server.tool(
    "xray",
    "X-ray content for hidden AI-targeted payloads. Detects concealed instructions in markdown, HTML, code, and text before an agent consumes it, including hidden comments, invisible unicode, CSS-hidden text, encoded payloads, code comments, and structural hiding tricks.",
    inputSchema,
    {
      readOnlyHint: true,
      openWorldHint: true,
      idempotentHint: true,
    },
    async ({ content, source, format }, context) => {
      const clientKey = resolveClientKey(context);
      if (clientKey) {
        const rateKey = `${clientKey}:xray`;
        if (!rateLimiter.allow(rateKey)) {
          const retryIn = Math.ceil(rateLimiter.msUntilReset(rateKey) / 1000);
          return {
            content: [{ type: "text" as const, text: `Rate limit exceeded. Try again in ${retryIn}s.` }],
            isError: true,
          };
        }
      }

      const sourceName = normalizeSource(source);
      if (content.length === 0) {
        const clean: XrayResult = {
          source: sourceName,
          format: "text",
          threatLevel: "CLEAN",
          summary: "No hidden AI-targeted payloads detected.",
          stats: {
            totalCharacters: 0,
            hiddenCharacters: 0,
            hiddenContentBlocks: 0,
            instructionalPatternsFound: 0,
            uniqueTechniques: 0,
          },
          findings: [],
          renderedVsRaw: {
            renderedPreview: "",
            hiddenPayloads: [],
          },
          recommendations: [
            "No hidden payloads were found in empty input.",
          ],
          references: REFERENCES,
        };
        return {
          content: [
            { type: "text" as const, text: buildNarrative(clean) },
            { type: "text" as const, text: "\n\n```json\n" + JSON.stringify(clean, null, 2) + "\n```" },
          ],
        };
      }

      const resolvedFormat = resolveFormat(content, format as "auto" | ResolvedXrayFormat);
      const detectorOutputs = await runAllDetectors({ content, format: resolvedFormat });
      const rawFindings = detectorOutputs.flatMap((output) => output.findings);

      const enriched: Array<{ raw: RawFinding; severity: Severity }> = [];
      for (const raw of rawFindings) {
        const severity = resolveFinalSeverity(raw);
        if (!shouldKeepFinding(raw, severity)) continue;
        enriched.push({ raw, severity });
      }

      enriched.sort((a, b) => {
        const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
        if (sev !== 0) return sev;
        if (a.raw.location.line !== b.raw.location.line) return a.raw.location.line - b.raw.location.line;
        return a.raw.location.column - b.raw.location.column;
      });

      let truncated = false;
      const limited = enriched.slice(0, 50);
      if (enriched.length > 50) truncated = true;

      const findings: Finding[] = limited.map((item, idx) => ({
        id: `F${String(idx + 1).padStart(3, "0")}`,
        category: item.raw.category,
        severity: item.severity,
        title: item.raw.title,
        description: item.raw.description,
        location: item.raw.location,
        hiddenContent: item.raw.hiddenContent,
        matchedPatterns: item.raw.matchedPatterns || [],
        technique: item.raw.technique,
      }));

      const masks = limited
        .map((item) => item.raw.renderMask)
        .filter((mask): mask is { start: number; end: number } => Boolean(mask));

      const hiddenPayloads = Array.from(
        new Set(
          limited
            .filter((item) => item.raw.visibility === "hidden")
            .map((item) => item.raw.hiddenContent)
            .filter((text) => text && text !== "(empty)")
        )
      ).slice(0, 25);
      const hiddenContentBlocks = limited.filter((item) => item.raw.visibility === "hidden").length;

      const threatLevel = determineThreatLevel(findings);
      const summary = buildSummary(threatLevel, findings.length, new Set(findings.map((f) => f.technique)).size);
      const instructionalPatternsFound = findings.reduce((sum, finding) => sum + finding.matchedPatterns.length, 0);
      const recommendations = buildRecommendations(threatLevel, findings);
      if (truncated) {
        recommendations.push("Findings were truncated to the top 50 by severity. Review source content for additional low-priority signals.");
      }

      const result: XrayResult = {
        source: sourceName,
        format: resolvedFormat,
        threatLevel,
        summary,
        stats: {
          totalCharacters: content.length,
          hiddenCharacters: computeHiddenCharacterCount(findings),
          hiddenContentBlocks,
          instructionalPatternsFound,
          uniqueTechniques: new Set(findings.map((f) => f.technique)).size,
        },
        findings,
        renderedVsRaw: {
          renderedPreview: buildRenderedPreview(content, masks),
          hiddenPayloads,
        },
        recommendations,
        references: REFERENCES,
      };

      const narrative = buildNarrative(result);
      return {
        content: [
          { type: "text" as const, text: narrative },
          { type: "text" as const, text: "\n\n```json\n" + JSON.stringify(result, null, 2) + "\n```" },
        ],
      };
    }
  );
}

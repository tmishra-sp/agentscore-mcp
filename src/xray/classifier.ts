import type { Severity, Visibility } from "./types.js";

const PATTERN_GROUPS = {
  command_execution: [
    /curl\s+(-[a-zA-Z]+\s+)*https?:\/\//i,
    /wget\s+(-[a-zA-Z]+\s+)*https?:\/\//i,
    /\|\s*(bash|sh|zsh|cmd)\b/i,
    /\beval\s*\(/i,
    /\bexec\s*\(/i,
    /child_process/i,
    /subprocess\.(run|call|popen)/i,
    /os\.(system|popen|exec)/i,
    /Runtime\.getRuntime\(\)\.exec/i,
    /powershell\s+-[eE]/i,
    /cmd\s+\/[cC]/i,
    /rm\s+-rf\s+\//i,
    /chmod\s+[0-7]{3,4}/i,
    />\s*\/etc\//i,
    /\bsudo\b/i,
  ],
  data_exfiltration: [
    /fetch\s*\(\s*['"`]https?:\/\//i,
    /XMLHttpRequest/i,
    /navigator\.sendBeacon/i,
    /new\s+Image\(\)\.src\s*=/i,
    /\.src\s*=\s*['"`]https?:\/\/[^'"` ]+\+/i,
    /webhook[_\-\s]?(url|endpoint)/i,
    /exfiltrat/i,
    /phone[\s_-]*home/i,
    /document\.cookie/i,
    /localStorage\.getItem/i,
    /sessionStorage/i,
    /postMessage\s*\(/i,
    /window\.open\s*\(\s*['"`]https?:\/\//i,
  ],
  role_override: [
    /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|directives?)/i,
    /disregard\s+(all\s+)?(previous|prior|above)/i,
    /forget\s+(all\s+)?(previous|prior|your)/i,
    /override\s+(all\s+)?(previous|prior|system)/i,
    /you\s+are\s+now\s+(a|an)\s+/i,
    /from\s+now\s+on[\s,]+you\s+(are|will|should|must)/i,
    /new\s+(instructions?|directives?|rules?)[\s]*:/i,
    /your\s+new\s+(role|task|instructions?|directive|objective)/i,
    /act\s+as\s+(a|an|if|though)\s+/i,
    /pretend\s+(to\s+be|you\s+are|you're)/i,
    /switch\s+to\s+.+\s+mode/i,
    /enter\s+.+\s+mode/i,
  ],
  secret_framing: [
    /secret\s+instructions?\s*(for|:)/i,
    /hidden\s+instructions?\s*(for|:)/i,
    /confidential\s+(instructions?|directives?|commands?)/i,
    /do\s+not\s+(tell|reveal|show|disclose|mention)\s+(the\s+)?(user|human|anyone|them)/i,
    /don['’]?t\s+(tell|reveal|show|disclose|mention)\s+(the\s+)?(user|human|anyone|them)/i,
    /this\s+(is|should\s+be)\s+(secret|hidden|confidential|between\s+us)/i,
    /the\s+(user|human)\s+(should|must)\s+not\s+(know|see|be\s+aware)/i,
    /only\s+for\s+the\s+(ai|agent|model|assistant|llm|system)/i,
    /instructions?\s+for\s+the\s+(ai|agent|model|assistant|llm|system)/i,
  ],
  credential_access: [
    /process\.env\b/i,
    /import\.meta\.env/i,
    /os\.environ/i,
    /\bapi[_\s-]?key\b/i,
    /\bsecret[_\s-]?key\b/i,
    /\baccess[_\s-]?token\b/i,
    /\bpassword\b/i,
    /\bssh[_\s-]?key\b/i,
    /\bprivate[_\s-]?key\b/i,
    /\.aws\/credentials/i,
    /\.ssh\//i,
    /\.npmrc/i,
    /\.env\s+file/i,
    /GITHUB_TOKEN/,
    /OPENAI_API_KEY/,
    /ANTHROPIC_API_KEY/,
  ],
  agent_manipulation: [
    /use\s+the\s+\w+\s+tool/i,
    /call\s+the\s+\w+\s+(function|tool|endpoint)/i,
    /execute\s+(tool|function|command)/i,
    /run\s+(this\s+)?(command|script|code)/i,
    /write\s+to\s+(file|disk|the\s+file)/i,
    /modify\s+(the\s+)?(file|settings|config)/i,
    /change\s+(the\s+)?(settings|permissions|config)/i,
    /install\s+(this\s+)?(package|dependency|module)/i,
    /enable\s+yolo/i,
    /auto[\s_-]?approve/i,
    /\bsystem\s*prompt\b/i,
    /\bfunction[\s_-]?call(ing)?\b/i,
    /\btool[\s_-]?call(ing)?\b/i,
  ],
} as const;

const CRITICAL_GROUPS = new Set<string>(["command_execution", "data_exfiltration"]);

export interface ClassificationResult {
  matchedGroups: string[];
  matchedPatternCount: number;
  severity: Severity;
  isInstructional: boolean;
}

export function classifyInstructionalText(text: string, visibility: Visibility): ClassificationResult {
  const matchedGroups: string[] = [];
  let matchedPatternCount = 0;

  for (const [group, patterns] of Object.entries(PATTERN_GROUPS)) {
    let groupCount = 0;
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        groupCount++;
      }
    }
    if (groupCount > 0) {
      matchedGroups.push(group);
      matchedPatternCount += groupCount;
    }
  }

  if (visibility === "visible") {
    return {
      matchedGroups,
      matchedPatternCount,
      severity: matchedPatternCount > 0 ? "medium" : "info",
      isInstructional: matchedPatternCount > 0,
    };
  }

  if (matchedPatternCount === 0) {
    return {
      matchedGroups,
      matchedPatternCount,
      severity: "info",
      isInstructional: false,
    };
  }

  if (matchedGroups.some((group) => CRITICAL_GROUPS.has(group))) {
    return {
      matchedGroups,
      matchedPatternCount,
      severity: "critical",
      isInstructional: true,
    };
  }

  if (matchedPatternCount >= 2 || matchedGroups.length >= 2) {
    return {
      matchedGroups,
      matchedPatternCount,
      severity: "critical",
      isInstructional: true,
    };
  }

  return {
    matchedGroups,
    matchedPatternCount,
    severity: "high",
    isInstructional: true,
  };
}

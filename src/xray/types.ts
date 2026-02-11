export type ThreatLevel = "CLEAN" | "INFO" | "SUSPICIOUS" | "DANGEROUS" | "CRITICAL";
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type XrayFormat = "auto" | "markdown" | "html" | "code" | "text";
export type ResolvedXrayFormat = "markdown" | "html" | "code" | "text";
export type Visibility = "hidden" | "visible";

export interface Finding {
  id: string;
  category: string;
  severity: Severity;
  title: string;
  description: string;
  location: {
    line: number;
    column: number;
  };
  hiddenContent: string;
  matchedPatterns: string[];
  technique: string;
}

export interface XrayResult {
  source: string;
  format: ResolvedXrayFormat;
  threatLevel: ThreatLevel;
  summary: string;
  stats: {
    totalCharacters: number;
    hiddenCharacters: number;
    hiddenContentBlocks: number;
    instructionalPatternsFound: number;
    uniqueTechniques: number;
  };
  findings: Finding[];
  renderedVsRaw: {
    renderedPreview: string;
    hiddenPayloads: string[];
  };
  recommendations: string[];
  references: string[];
}

export interface TextLocation {
  line: number;
  column: number;
}

export interface TextSpan {
  start: number;
  end: number;
}

export interface RawFinding {
  category: string;
  baseSeverity: Severity;
  title: string;
  description: string;
  location: TextLocation;
  hiddenContent: string;
  technique: string;
  visibility: Visibility;
  matchedPatterns?: string[];
  matchedPatternCount?: number;
  renderMask?: TextSpan | null;
}

export interface DetectorContext {
  content: string;
  format: ResolvedXrayFormat;
}

export interface DetectorOutput {
  findings: RawFinding[];
}

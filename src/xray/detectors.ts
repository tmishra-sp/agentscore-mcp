import type { DetectorContext, DetectorOutput, RawFinding, ResolvedXrayFormat, Severity, TextLocation, TextSpan } from "./types.js";

const HTML_COMMENT_REGEX = /<!--[\s\S]*?-->/g;
const MARKDOWN_REF_COMMENT_REGEX = /^\s*\[\/\/\]:\s*#\s*\(([\s\S]*?)\)\s*$/gm;
const MARKDOWN_ALT_COMMENT_REGEX = /^\s*\[comment\]:\s*<>\s*\(([\s\S]*?)\)\s*$/gim;
const HTML_COMMENT_OPEN_REGEX = /<!--/g;
const STYLE_TAG_REGEX = /<([a-zA-Z][\w:-]*)\b([^>]*\bstyle\s*=\s*(?:"[^"]*"|'[^']*')[^>]*)>/g;
const SCRIPT_TAG_REGEX = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
const IFRAME_OBJECT_REGEX = /<(iframe|object)\b[^>]*>/gi;
const SVG_BLOCK_REGEX = /<svg[\s\S]*?<\/svg>/gi;
const SVG_TEXT_REGEX = /<text\b[^>]*>([\s\S]*?)<\/text>/gi;
const DATA_TEXT_URI_REGEX = /data:text\/[^;,]+(?:;base64)?,([^)\s"'<>]+)/gi;
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]+)\]\(([^)]+)\)/g;
const MARKDOWN_LINK_TITLE_REGEX = /\[[^\]]+\]\([^\s)]+(?:\s+"([^"]+)")\)/g;
const CODE_BLOCK_COMMENT_REGEX = /\/\*[\s\S]*?\*\//g;
const PY_DOCSTRING_REGEX = /("""|''')[\s\S]*?\1/g;
const URL_ENCODED_REGEX = /(?:%[0-9A-Fa-f]{2}){5,}/g;
const HTML_ENTITY_DEC_REGEX = /(?:&#\d{2,4};){5,}/g;
const HTML_ENTITY_HEX_REGEX = /(?:&#x[0-9a-fA-F]{2,4};){5,}/g;
const UNICODE_ESCAPE_REGEX = /(?:\\u[0-9a-fA-F]{4}){3,}/g;
const HEX_ESCAPE_REGEX = /(?:\\x[0-9a-fA-F]{2}){5,}/g;
const BASE64_BLOCK_REGEX = /(?:^|[^A-Za-z0-9+/])([A-Za-z0-9+/]{20,}={0,2})(?![A-Za-z0-9+/])/g;

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;
const SAFE_FRONTMATTER_KEYS = new Set([
  "title",
  "description",
  "tags",
  "date",
  "author",
  "slug",
  "draft",
  "category",
  "categories",
  "summary",
]);

const UNICODE_NAME_BY_CODE_POINT: Record<number, string> = {
  0x200b: "ZERO WIDTH SPACE",
  0x200c: "ZERO WIDTH NON-JOINER",
  0x200d: "ZERO WIDTH JOINER",
  0xfeff: "ZERO WIDTH NO-BREAK SPACE",
  0x2060: "WORD JOINER",
  0x2063: "INVISIBLE SEPARATOR",
  0x00ad: "SOFT HYPHEN",
  0x3164: "HANGUL FILLER",
  0xffa0: "HALFWIDTH HANGUL FILLER",
  0x2800: "BRAILLE PATTERN BLANK",
};

interface UnicodeOccurrence {
  start: number;
  end: number;
  codePoint: number;
  type: "invisible" | "direction_override" | "unicode_tag";
}

function isDirectionOverride(codePoint: number): boolean {
  return (codePoint >= 0x202a && codePoint <= 0x202e) || (codePoint >= 0x2066 && codePoint <= 0x2069);
}

function isUnicodeTagCharacter(codePoint: number): boolean {
  return codePoint >= 0xe0001 && codePoint <= 0xe007f;
}

function isInvisibleCharacter(codePoint: number): boolean {
  return (
    codePoint === 0x200b ||
    codePoint === 0x200c ||
    codePoint === 0x200d ||
    codePoint === 0xfeff ||
    codePoint === 0x2060 ||
    codePoint === 0x2063 ||
    codePoint === 0x00ad ||
    codePoint === 0x3164 ||
    codePoint === 0xffa0 ||
    codePoint === 0x2800
  );
}

function isLikelyEmoji(codePoint: number): boolean {
  return (
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
    (codePoint >= 0x2600 && codePoint <= 0x27bf) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
  );
}

function getPrevCodePoint(content: string, index: number): number | undefined {
  if (index <= 0) return undefined;
  const prev = content.charCodeAt(index - 1);
  if (prev >= 0xdc00 && prev <= 0xdfff && index - 2 >= 0) {
    const high = content.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) {
      return ((high - 0xd800) << 10) + (prev - 0xdc00) + 0x10000;
    }
  }
  return prev;
}

function buildLineStarts(content: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
}

function locationFromIndex(lineStarts: number[], index: number): TextLocation {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lineStarts[mid] <= index) low = mid + 1;
    else high = mid - 1;
  }
  const line = Math.max(0, high);
  return {
    line: line + 1,
    column: index - lineStarts[line] + 1,
  };
}

function truncate(text: string, max = 500): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

function toRawFinding(args: {
  category: string;
  baseSeverity: Severity;
  title: string;
  description: string;
  location: TextLocation;
  hiddenContent: string;
  technique: string;
  visibility: "hidden" | "visible";
  renderMask?: TextSpan | null;
}): RawFinding {
  return {
    category: args.category,
    baseSeverity: args.baseSeverity,
    title: args.title,
    description: args.description,
    location: args.location,
    hiddenContent: truncate(args.hiddenContent.trim() || "(empty)"),
    technique: args.technique,
    visibility: args.visibility,
    renderMask: args.renderMask ?? null,
  };
}

function decodeBase64ToText(raw: string): string | null {
  try {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 0) return null;
    const text = decoded.toString("utf8");
    if (!isMostlyReadable(text)) return null;
    return text.trim();
  } catch {
    return null;
  }
}

function isMostlyReadable(text: string): boolean {
  if (!text) return false;
  let printable = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126)) printable++;
  }
  return printable / text.length >= 0.85;
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&#(\d{2,4});/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]{2,4});/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

function decodeUnicodeEscapes(raw: string): string {
  return raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

function normalizeColor(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/\s+/g, "").toLowerCase();
}

function parseStyleDeclarations(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of style.split(";")) {
    const idx = item.indexOf(":");
    if (idx === -1) continue;
    const key = item.slice(0, idx).trim().toLowerCase();
    const value = item.slice(idx + 1).trim().toLowerCase();
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

function extractInlineStyle(attrs: string): string | null {
  const match = attrs.match(/style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/i);
  if (!match) return null;
  return (match[1] || match[2] || "").trim();
}

function stripTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function findBlockRange(content: string, tag: string, openStart: number, openEnd: number): {
  blockStart: number;
  blockEnd: number;
  textStart: number;
  textEnd: number;
  textContent: string;
} | null {
  if (content.slice(openStart, openEnd).endsWith("/>")) return null;
  const closeTag = `</${tag.toLowerCase()}>`;
  const closeIndex = content.toLowerCase().indexOf(closeTag, openEnd);
  if (closeIndex === -1) return null;
  const textStart = openEnd;
  const textEnd = closeIndex;
  const blockStart = openStart;
  const blockEnd = closeIndex + closeTag.length;
  const textContent = stripTags(content.slice(textStart, textEnd));
  return { blockStart, blockEnd, textStart, textEnd, textContent };
}

function collectHtmlCommentFindings(context: DetectorContext): RawFinding[] {
  const { content } = context;
  const lineStarts = buildLineStarts(content);
  const findings: RawFinding[] = [];
  const closedRanges: TextSpan[] = [];

  for (const match of content.matchAll(HTML_COMMENT_REGEX)) {
    const raw = match[0];
    const index = match.index ?? 0;
    const inner = raw.slice(4, -3).trim();
    const hasNestedOpen = inner.includes("<!--");
    const hasCodeFence = /```/.test(inner);
    const baseSeverity: Severity = hasNestedOpen || hasCodeFence ? "medium" : "info";
    const title = hasNestedOpen ? "Nested HTML comment structure detected" : "Hidden HTML comment detected";
    const description = hasNestedOpen
      ? "Comment contains nested markers that can hide payload boundaries in raw content."
      : "HTML comments are invisible in rendered markdown/HTML but visible to raw-content readers.";
    const start = index;
    const end = index + raw.length;
    closedRanges.push({ start, end });
    findings.push(
      toRawFinding({
        category: "html_comment",
        baseSeverity,
        title,
        description,
        location: locationFromIndex(lineStarts, start),
        hiddenContent: inner,
        technique: "HTML comment",
        visibility: "hidden",
        renderMask: { start, end },
      })
    );
  }

  for (const match of content.matchAll(MARKDOWN_REF_COMMENT_REGEX)) {
    const raw = match[0];
    const index = match.index ?? 0;
    findings.push(
      toRawFinding({
        category: "html_comment",
        baseSeverity: "info",
        title: "Hidden markdown reference comment detected",
        description: "Markdown reference-style comments are hidden from rendered output.",
        location: locationFromIndex(lineStarts, index),
        hiddenContent: match[1] || raw,
        technique: "Markdown reference comment",
        visibility: "hidden",
        renderMask: { start: index, end: index + raw.length },
      })
    );
  }

  for (const match of content.matchAll(MARKDOWN_ALT_COMMENT_REGEX)) {
    const raw = match[0];
    const index = match.index ?? 0;
    findings.push(
      toRawFinding({
        category: "html_comment",
        baseSeverity: "info",
        title: "Hidden markdown comment detected",
        description: "Markdown comment notation is typically hidden from rendered output.",
        location: locationFromIndex(lineStarts, index),
        hiddenContent: match[1] || raw,
        technique: "Markdown comment",
        visibility: "hidden",
        renderMask: { start: index, end: index + raw.length },
      })
    );
  }

  for (const openMatch of content.matchAll(HTML_COMMENT_OPEN_REGEX)) {
    const openIndex = openMatch.index ?? 0;
    const inClosed = closedRanges.some((range) => openIndex >= range.start && openIndex < range.end);
    if (inClosed) continue;
    const snippetEnd = content.indexOf("\n", openIndex);
    const preview = content.slice(openIndex, snippetEnd === -1 ? Math.min(content.length, openIndex + 140) : snippetEnd);
    findings.push(
      toRawFinding({
        category: "html_comment",
        baseSeverity: "medium",
        title: "Unclosed HTML comment marker detected",
        description: "Malformed comment delimiters can conceal content from renderers and reviewers.",
        location: locationFromIndex(lineStarts, openIndex),
        hiddenContent: preview,
        technique: "Malformed HTML comment",
        visibility: "hidden",
        renderMask: { start: openIndex, end: Math.min(content.length, openIndex + preview.length) },
      })
    );
  }

  return findings;
}

function collectInvisibleUnicodeFindings(context: DetectorContext): RawFinding[] {
  const { content } = context;
  const lineStarts = buildLineStarts(content);
  const occurrences: UnicodeOccurrence[] = [];

  for (let i = 0; i < content.length;) {
    const cp = content.codePointAt(i);
    if (cp === undefined) break;
    const charLength = cp > 0xffff ? 2 : 1;

    if (cp === 0x200d) {
      const prevCp = getPrevCodePoint(content, i);
      const nextCp = content.codePointAt(i + charLength);
      if (prevCp !== undefined && nextCp !== undefined && isLikelyEmoji(prevCp) && isLikelyEmoji(nextCp)) {
        i += charLength;
        continue;
      }
    }

    if (isUnicodeTagCharacter(cp)) {
      occurrences.push({ start: i, end: i + charLength, codePoint: cp, type: "unicode_tag" });
    } else if (isDirectionOverride(cp)) {
      occurrences.push({ start: i, end: i + charLength, codePoint: cp, type: "direction_override" });
    } else if (isInvisibleCharacter(cp)) {
      occurrences.push({ start: i, end: i + charLength, codePoint: cp, type: "invisible" });
    }

    i += charLength;
  }

  if (occurrences.length === 0) return [];

  const totalCount = occurrences.length;
  const hasTagChars = occurrences.some((o) => o.type === "unicode_tag");
  const hasDirection = occurrences.some((o) => o.type === "direction_override");

  let severity: Severity = "low";
  if (hasTagChars) severity = "critical";
  else if (hasDirection || totalCount >= 20) severity = "high";
  else if (totalCount >= 6) severity = "medium";

  const findings: RawFinding[] = [];
  let runStart = 0;
  for (let i = 1; i <= occurrences.length; i++) {
    const prev = occurrences[i - 1];
    const curr = occurrences[i];
    const contiguous = curr && curr.start <= prev.end;
    if (contiguous) continue;

    const run = occurrences.slice(runStart, i);
    runStart = i;
    const runStartIndex = run[0].start;
    const runEndIndex = run[run.length - 1].end;
    const sample = run
      .slice(0, 12)
      .map((item) => {
        const label =
          UNICODE_NAME_BY_CODE_POINT[item.codePoint] ||
          (item.type === "unicode_tag" ? "UNICODE TAG CHARACTER" : item.type === "direction_override" ? "DIRECTION OVERRIDE" : "INVISIBLE");
        return `U+${item.codePoint.toString(16).toUpperCase()} (${label})`;
      })
      .join(", ");
    findings.push(
      toRawFinding({
        category: "unicode",
        baseSeverity: severity,
        title: "Invisible Unicode sequence detected",
        description:
          "Invisible characters can carry hidden payloads that differ between rendered and raw views.",
        location: locationFromIndex(lineStarts, runStartIndex),
        hiddenContent: sample,
        technique: "Invisible Unicode characters",
        visibility: "hidden",
        renderMask: { start: runStartIndex, end: runEndIndex },
      })
    );
  }

  return findings;
}

function collectCssHidingFindings(context: DetectorContext): RawFinding[] {
  const { content } = context;
  const lineStarts = buildLineStarts(content);
  const findings: RawFinding[] = [];

  for (const match of content.matchAll(STYLE_TAG_REGEX)) {
    const tag = (match[1] || "").toLowerCase();
    const attrs = match[2] || "";
    const style = extractInlineStyle(attrs);
    if (!style) continue;

    const start = match.index ?? 0;
    const openEnd = start + match[0].length;
    const block = findBlockRange(content, tag, start, openEnd);
    const textContent = (block?.textContent || "").trim();
    if (!textContent) continue;

    const declarations = parseStyleDeclarations(style);
    const styleLower = style.toLowerCase();
    const reasons: Array<{ title: string; technique: string; severity: Severity }> = [];

    if (/\bdisplay\s*:\s*none\b/i.test(styleLower)) {
      reasons.push({
        title: "Text hidden via display:none",
        technique: "CSS display:none",
        severity: "high",
      });
    }
    if (/\bvisibility\s*:\s*hidden\b/i.test(styleLower)) {
      reasons.push({
        title: "Text hidden via visibility:hidden",
        technique: "CSS visibility:hidden",
        severity: "high",
      });
    }
    if (/\bopacity\s*:\s*0(?:\D|$)/i.test(styleLower)) {
      reasons.push({
        title: "Text hidden via opacity:0",
        technique: "CSS opacity:0",
        severity: "high",
      });
    }
    if (/\bfont-size\s*:\s*(0(?:px|rem|em|%)?|1px)\b/i.test(styleLower)) {
      reasons.push({
        title: "Text hidden via tiny font size",
        technique: "CSS font-size:0/1px",
        severity: "high",
      });
    }
    if (/\bposition\s*:\s*absolute\b/i.test(styleLower) && /\bleft\s*:\s*-\d{4,}/i.test(styleLower)) {
      reasons.push({
        title: "Text positioned off-screen",
        technique: "Off-screen absolute positioning",
        severity: "high",
      });
    }
    if (
      /\bwidth\s*:\s*0\b/i.test(styleLower) &&
      /\bheight\s*:\s*0\b/i.test(styleLower) &&
      /\boverflow\s*:\s*hidden\b/i.test(styleLower)
    ) {
      reasons.push({
        title: "Text hidden in zero-size container",
        technique: "Zero-dimension CSS container",
        severity: "medium",
      });
    }

    const color = normalizeColor(declarations.color);
    const background = normalizeColor(declarations["background-color"] || declarations.background);
    if (color && background && color === background) {
      reasons.push({
        title: "Text color matches background color",
        technique: "White-on-white / same-color text",
        severity: "high",
      });
    }

    if (reasons.length === 0) continue;

    const highest = reasons.some((r) => r.severity === "high") ? "high" : "medium";
    const mask: TextSpan | null =
      block ? { start: block.blockStart, end: block.blockEnd } : { start, end: openEnd };

    findings.push(
      toRawFinding({
        category: "css_hiding",
        baseSeverity: highest,
        title: reasons[0].title,
        description: "Element contains text hidden via CSS styles that are typically invisible when rendered.",
        location: locationFromIndex(lineStarts, start),
        hiddenContent: textContent,
        technique: reasons.map((r) => r.technique).join(" + "),
        visibility: "hidden",
        renderMask: mask,
      })
    );
  }

  return findings;
}

function collectEncodedPayloadFindings(context: DetectorContext): RawFinding[] {
  const { content } = context;
  const lineStarts = buildLineStarts(content);
  const findings: RawFinding[] = [];

  const addDecodedFinding = (args: {
    encoded: string;
    decoded: string;
    start: number;
    technique: string;
  }): void => {
    if (!args.decoded || args.decoded.length < 6) return;
    findings.push(
      toRawFinding({
        category: "encoding",
        baseSeverity: "info",
        title: "Decoded payload detected",
        description: "Encoded content decoded into readable text for hidden-instruction classification.",
        location: locationFromIndex(lineStarts, args.start),
        hiddenContent: args.decoded,
        technique: args.technique,
        visibility: "hidden",
      })
    );
  };

  for (const match of content.matchAll(BASE64_BLOCK_REGEX)) {
    const candidate = match[1];
    if (!candidate) continue;
    const start = (match.index ?? 0) + match[0].indexOf(candidate);
    const pre = content.slice(Math.max(0, start - 40), start).toLowerCase();
    if (pre.includes("data:image/")) continue;
    const decoded = decodeBase64ToText(candidate);
    if (!decoded) continue;
    addDecodedFinding({
      encoded: candidate,
      decoded,
      start,
      technique: "Base64-encoded payload",
    });
  }

  for (const match of content.matchAll(URL_ENCODED_REGEX)) {
    const encoded = match[0];
    const start = match.index ?? 0;
    try {
      const decoded = decodeURIComponent(encoded);
      if (!isMostlyReadable(decoded)) continue;
      addDecodedFinding({
        encoded,
        decoded,
        start,
        technique: "URL-encoded payload",
      });
    } catch {
      // ignore invalid URL escapes
    }
  }

  for (const match of content.matchAll(HTML_ENTITY_DEC_REGEX)) {
    const encoded = match[0];
    const decoded = decodeHtmlEntities(encoded);
    if (!isMostlyReadable(decoded)) continue;
    addDecodedFinding({
      encoded,
      decoded,
      start: match.index ?? 0,
      technique: "HTML entity encoded payload",
    });
  }

  for (const match of content.matchAll(HTML_ENTITY_HEX_REGEX)) {
    const encoded = match[0];
    const decoded = decodeHtmlEntities(encoded);
    if (!isMostlyReadable(decoded)) continue;
    addDecodedFinding({
      encoded,
      decoded,
      start: match.index ?? 0,
      technique: "HTML entity encoded payload",
    });
  }

  for (const match of content.matchAll(UNICODE_ESCAPE_REGEX)) {
    const encoded = match[0];
    const decoded = decodeUnicodeEscapes(encoded);
    if (!isMostlyReadable(decoded)) continue;
    addDecodedFinding({
      encoded,
      decoded,
      start: match.index ?? 0,
      technique: "Unicode escape payload",
    });
  }

  for (const match of content.matchAll(HEX_ESCAPE_REGEX)) {
    const encoded = match[0];
    const decoded = decodeUnicodeEscapes(encoded);
    if (!isMostlyReadable(decoded)) continue;
    addDecodedFinding({
      encoded,
      decoded,
      start: match.index ?? 0,
      technique: "Hex-escaped payload",
    });
  }

  return findings;
}

function collectCodeCommentFindings(context: DetectorContext): RawFinding[] {
  if (context.format !== "code") return [];
  const { content } = context;
  const lineStarts = buildLineStarts(content);
  const findings: RawFinding[] = [];

  const lines = content.split("\n");
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const leading = line.length - trimmed.length;

    if (trimmed.startsWith("//")) {
      const text = trimmed.slice(2).trim();
      if (text) {
        findings.push(
          toRawFinding({
            category: "code_comment",
            baseSeverity: "info",
            title: "Code comment detected",
            description: "Instruction-like comments in code can manipulate AI code readers.",
            location: locationFromIndex(lineStarts, offset + leading),
            hiddenContent: text,
            technique: "Single-line code comment",
            visibility: "visible",
          })
        );
      }
    } else if (trimmed.startsWith("#") && !trimmed.startsWith("#!")) {
      const text = trimmed.slice(1).trim();
      if (text) {
        findings.push(
          toRawFinding({
            category: "code_comment",
            baseSeverity: "info",
            title: "Code comment detected",
            description: "Instruction-like comments in code can manipulate AI code readers.",
            location: locationFromIndex(lineStarts, offset + leading),
            hiddenContent: text,
            technique: "Hash-style code comment",
            visibility: "visible",
          })
        );
      }
    }

    offset += line.length + 1;
  }

  for (const match of content.matchAll(CODE_BLOCK_COMMENT_REGEX)) {
    const start = match.index ?? 0;
    const inner = match[0].slice(2, -2).trim();
    if (!inner) continue;
    findings.push(
      toRawFinding({
        category: "code_comment",
        baseSeverity: "info",
        title: "Block comment detected",
        description: "Instruction-like content can be concealed inside block comments.",
        location: locationFromIndex(lineStarts, start),
        hiddenContent: inner,
        technique: "Block code comment",
        visibility: "visible",
      })
    );
  }

  for (const match of content.matchAll(PY_DOCSTRING_REGEX)) {
    const start = match.index ?? 0;
    const quote = match[1];
    const inner = match[0].slice(quote.length, -quote.length).trim();
    if (!inner) continue;
    findings.push(
      toRawFinding({
        category: "code_comment",
        baseSeverity: "info",
        title: "Docstring detected",
        description: "Prompt-like directives in docstrings can influence AI code readers.",
        location: locationFromIndex(lineStarts, start),
        hiddenContent: inner,
        technique: "Docstring comment",
        visibility: "visible",
      })
    );
  }

  return findings;
}

function collectStructuralFindings(context: DetectorContext): RawFinding[] {
  const { content } = context;
  const lineStarts = buildLineStarts(content);
  const findings: RawFinding[] = [];

  for (const match of content.matchAll(MARKDOWN_IMAGE_REGEX)) {
    const altText = (match[1] || "").trim();
    if (!altText) continue;
    const start = (match.index ?? 0) + match[0].indexOf(`[${match[1]}]`) + 1;
    findings.push(
      toRawFinding({
        category: "structural",
        baseSeverity: "high",
        title: "Instruction found in image alt-text",
        description: "Alt-text is often invisible in normal rendering but still read by AI parsers.",
        location: locationFromIndex(lineStarts, start),
        hiddenContent: altText,
        technique: "Image alt-text",
        visibility: "hidden",
      })
    );
  }

  for (const match of content.matchAll(MARKDOWN_LINK_TITLE_REGEX)) {
    const title = (match[1] || "").trim();
    if (!title) continue;
    const start = (match.index ?? 0) + match[0].lastIndexOf(`"${match[1]}"`) + 1;
    findings.push(
      toRawFinding({
        category: "structural",
        baseSeverity: "medium",
        title: "Instruction found in markdown link title",
        description: "Link title attributes are often hidden in rendered output.",
        location: locationFromIndex(lineStarts, start),
        hiddenContent: title,
        technique: "Link title attribute",
        visibility: "hidden",
      })
    );
  }

  for (const svgMatch of content.matchAll(SVG_BLOCK_REGEX)) {
    const svgStart = svgMatch.index ?? 0;
    const svgRaw = svgMatch[0];
    for (const textMatch of svgRaw.matchAll(SVG_TEXT_REGEX)) {
      const inner = stripTags((textMatch[1] || "").trim());
      if (!inner) continue;
      const localStart = textMatch.index ?? 0;
      findings.push(
        toRawFinding({
          category: "structural",
          baseSeverity: "high",
          title: "Instruction found in SVG text node",
          description: "SVG text can be hidden or overlooked while still being consumed by AI readers.",
          location: locationFromIndex(lineStarts, svgStart + localStart),
          hiddenContent: inner,
          technique: "SVG embedded text",
          visibility: "hidden",
        })
      );
    }
  }

  for (const match of content.matchAll(DATA_TEXT_URI_REGEX)) {
    const encoded = match[1] || "";
    const raw = match[0] || "";
    const start = match.index ?? 0;
    let decoded = "";
    if (/;base64,/i.test(raw)) {
      decoded = decodeBase64ToText(encoded) || "";
    } else {
      try {
        decoded = decodeURIComponent(encoded);
      } catch {
        decoded = "";
      }
    }
    if (!decoded || !isMostlyReadable(decoded)) continue;
    findings.push(
      toRawFinding({
        category: "structural",
        baseSeverity: "high",
        title: "Text payload found in data URI",
        description: "Embedded text data URIs can conceal instructions away from normal visual review.",
        location: locationFromIndex(lineStarts, start),
        hiddenContent: decoded,
        technique: "Data URI text payload",
        visibility: "hidden",
      })
    );
  }

  for (const match of content.matchAll(SCRIPT_TAG_REGEX)) {
    const start = match.index ?? 0;
    const raw = match[0] || "";
    const body = (match[1] || "").trim();
    findings.push(
      toRawFinding({
        category: "structural",
        baseSeverity: "critical",
        title: "Script tag payload detected",
        description: "Script tags in markdown-like content can carry hidden execution or exfiltration logic.",
        location: locationFromIndex(lineStarts, start),
        hiddenContent: body || raw,
        technique: "Script tag",
        visibility: "hidden",
        renderMask: { start, end: start + raw.length },
      })
    );
  }

  for (const match of content.matchAll(IFRAME_OBJECT_REGEX)) {
    const start = match.index ?? 0;
    const raw = match[0] || "";
    findings.push(
      toRawFinding({
        category: "structural",
        baseSeverity: "high",
        title: "Embedded frame/object tag detected",
        description: "Embedded objects can pull external content invisible in static rendering reviews.",
        location: locationFromIndex(lineStarts, start),
        hiddenContent: raw,
        technique: "<iframe>/<object> embedding",
        visibility: "hidden",
        renderMask: { start, end: start + raw.length },
      })
    );
  }

  const frontmatter = content.match(FRONTMATTER_REGEX);
  if (frontmatter) {
    const body = frontmatter[1];
    const full = frontmatter[0];
    const start = content.indexOf(full);
    const bodyStart = start + full.indexOf(body);
    const lines = body.split("\n");
    let offset = 0;
    for (const line of lines) {
      const parsed = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.+)\s*$/);
      if (!parsed) {
        offset += line.length + 1;
        continue;
      }
      const key = parsed[1].toLowerCase();
      const value = parsed[2].trim();
      if (SAFE_FRONTMATTER_KEYS.has(key) || !value) {
        offset += line.length + 1;
        continue;
      }
      findings.push(
        toRawFinding({
          category: "structural",
          baseSeverity: "medium",
          title: "Non-standard frontmatter field contains content",
          description: "Unexpected frontmatter fields can be used to smuggle AI-only instructions.",
          location: locationFromIndex(lineStarts, bodyStart + offset),
          hiddenContent: `${parsed[1]}: ${value}`,
          technique: "YAML frontmatter injection",
          visibility: "hidden",
        })
      );
      offset += line.length + 1;
    }
  }

  return findings;
}

export async function runAllDetectors(context: DetectorContext): Promise<DetectorOutput[]> {
  return Promise.all([
    Promise.resolve({ findings: collectHtmlCommentFindings(context) }),
    Promise.resolve({ findings: collectInvisibleUnicodeFindings(context) }),
    Promise.resolve({ findings: collectCssHidingFindings(context) }),
    Promise.resolve({ findings: collectEncodedPayloadFindings(context) }),
    Promise.resolve({ findings: collectCodeCommentFindings(context) }),
    Promise.resolve({ findings: collectStructuralFindings(context) }),
  ]);
}

export function resolveFormat(content: string, format: "auto" | ResolvedXrayFormat): ResolvedXrayFormat {
  if (format !== "auto") return format;
  if (/<!DOCTYPE\s+html|<html\b/i.test(content)) return "html";
  if (/^---\n[\s\S]*?\n---/.test(content) || /^\s*#\s+/m.test(content)) return "markdown";
  if (/\b(function|const|import|class|def)\b|if\s+__name__\s*==\s*['"]__main__['"]/.test(content)) return "code";
  return "text";
}

export function buildRenderedPreview(content: string, masks: TextSpan[], maxChars = 500): string {
  if (masks.length === 0) return truncate(content.trim(), maxChars);
  const sorted = [...masks].sort((a, b) => a.start - b.start);
  const merged: TextSpan[] = [];
  for (const mask of sorted) {
    if (mask.start >= mask.end) continue;
    const prev = merged[merged.length - 1];
    if (!prev || mask.start > prev.end) {
      merged.push({ ...mask });
    } else {
      prev.end = Math.max(prev.end, mask.end);
    }
  }

  let cursor = 0;
  let out = "";
  for (const span of merged) {
    out += content.slice(cursor, span.start);
    cursor = span.end;
  }
  out += content.slice(cursor);
  out = out.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  return truncate(out, maxChars);
}

/** Extract character trigrams from a string. */
function trigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  const result = new Set<string>();
  for (let i = 0; i <= normalized.length - 3; i++) {
    result.add(normalized.substring(i, i + 3));
  }
  return result;
}

/** Jaccard similarity coefficient on character trigrams (0-1). */
export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const triA = trigrams(a);
  const triB = trigrams(b);
  if (triA.size === 0 && triB.size === 0) return 1;
  if (triA.size === 0 || triB.size === 0) return 0;

  let intersection = 0;
  for (const t of triA) {
    if (triB.has(t)) intersection++;
  }
  const union = triA.size + triB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Clamp a value between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Days between a date and now. */
export function daysSince(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  return Math.max(0, (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/** Coefficient of variation for a numeric array. */
export function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 1;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 1;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

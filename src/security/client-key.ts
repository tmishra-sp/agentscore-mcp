type LooseRecord = Record<string, unknown>;

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function getPath(obj: LooseRecord, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as LooseRecord)[key];
  }
  return current;
}

/**
 * Resolve a stable client key for rate limiting.
 * Returns null if no reliable identifier exists in the request context.
 */
export function resolveClientKey(context: unknown): string | null {
  if (!context || typeof context !== "object") return null;
  const obj = context as LooseRecord;

  const candidates: Array<{ prefix: string; path: string[] }> = [
    { prefix: "session", path: ["sessionId"] },
    { prefix: "client", path: ["clientId"] },
    { prefix: "connection", path: ["connectionId"] },
    { prefix: "meta-session", path: ["meta", "sessionId"] },
    { prefix: "meta-session", path: ["_meta", "sessionId"] },
    { prefix: "meta-client", path: ["meta", "clientId"] },
    { prefix: "meta-client", path: ["_meta", "clientId"] },
    { prefix: "transport", path: ["transport", "sessionId"] },
  ];

  for (const candidate of candidates) {
    const value = readString(getPath(obj, candidate.path));
    if (value) {
      return `${candidate.prefix}:${value}`;
    }
  }

  return null;
}

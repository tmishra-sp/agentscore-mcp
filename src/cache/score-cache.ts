import type { AgentProfile } from "../adapters/types.js";
import type { AgentScoreResult } from "../scoring/types.js";

interface CacheEntry {
  result: AgentScoreResult;
  profile: AgentProfile;
  storedAt: number;
}

/** In-memory LRU cache with TTL for agent scores. */
export class ScoreCache {
  private cache = new Map<string, CacheEntry>();
  private ttlMs: number;
  private maxEntries: number;

  constructor(ttlSeconds: number = 86400, maxEntries: number = 1000) {
    this.ttlMs = ttlSeconds * 1000;
    this.maxEntries = maxEntries;
  }

  private key(platform: string, handle: string): string {
    return `${platform}:${handle.toLowerCase()}`;
  }

  get(platform: string, handle: string): CacheEntry | null {
    const k = this.key(platform, handle);
    const entry = this.cache.get(k);
    if (!entry) return null;

    if (Date.now() - entry.storedAt > this.ttlMs) {
      this.cache.delete(k);
      return null;
    }

    // LRU: move to end
    this.cache.delete(k);
    this.cache.set(k, entry);
    return entry;
  }

  set(platform: string, handle: string, result: AgentScoreResult, profile: AgentProfile): void {
    const k = this.key(platform, handle);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries && !this.cache.has(k)) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(k, { result, profile, storedAt: Date.now() });
  }

  has(platform: string, handle: string): boolean {
    return this.get(platform, handle) !== null;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

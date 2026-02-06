export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

/**
 * Simple in-memory fixed-window rate limiter.
 * Designed for MCP tool calls per client/session.
 */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Returns true if allowed, false if rate limited.
   */
  allow(key: string): boolean {
    const now = Date.now();
    this.pruneExpired(now);
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= this.config.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (bucket.count >= this.config.maxRequests) {
      return false;
    }
    bucket.count += 1;
    return true;
  }

  /** Remove expired buckets to prevent unbounded memory growth. */
  private pruneExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart >= this.config.windowMs) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Returns ms until reset for a key, or 0 if new window.
   */
  msUntilReset(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return 0;
    const elapsed = Date.now() - bucket.windowStart;
    return Math.max(0, this.config.windowMs - elapsed);
  }
}

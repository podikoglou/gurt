import type { RateLimiter } from "./client";
import type { RateLimitInfo } from "../types/discord";
import { delay } from "../utils/delay.js";

/**
 * Tracks rate limit state for a specific Discord API route
 */
interface RouteBucket {
  limit: number;
  remaining: number;
  resetAt: number;
  isGlobal: boolean;
}

/**
 * Token bucket rate limiter for Discord API
 *
 * Implements Discord's rate limiting strategy:
 * - Global rate limits affect all routes
 * - Route-specific limits have independent buckets
 * - Uses X-RateLimit headers to update bucket state
 */
export class TokenBucketRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, RouteBucket>();
  private globalResetAt = 0;
  private readonly defaultLimit = 50;

  async checkLimit(route: string): Promise<void> {
    const now = Date.now();

    if (this.globalResetAt > now) {
      const waitTime = this.globalResetAt - now;
      console.warn(`Global rate limit active, waiting ${waitTime}ms`);
      await delay(waitTime);
    }

    const bucket = this.buckets.get(route);
    if (bucket) {
      if (bucket.resetAt <= now) {
        bucket.remaining = bucket.limit;
        bucket.resetAt = now + bucket.resetAt - (bucket.resetAt - now);
      }

      if (bucket.remaining <= 0) {
        const waitTime = bucket.resetAt - now;
        console.warn(`Route ${route} rate limit hit, waiting ${waitTime}ms`);
        await delay(waitTime);
      }
    }
  }

  updateLimit(route: string, info: RateLimitInfo): void {
    const now = Date.now();

    if (info.global) {
      this.globalResetAt = now + (info.retryAfter || 0) * 1000;
      console.warn(`Global rate limit hit, reset at ${new Date(this.globalResetAt)}`);
      return;
    }

    const bucket: RouteBucket = {
      limit: info.limit,
      remaining: info.remaining,
      resetAt: now + info.resetAfter * 1000,
      isGlobal: info.global,
    };

    this.buckets.set(route, bucket);

    if (info.remaining < 5) {
      console.warn(`Rate limit for ${route}: ${info.remaining}/${info.limit} remaining`);
    }
  }

  getGlobalDelay(): number {
    const now = Date.now();
    return Math.max(0, this.globalResetAt - now);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [route, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(route);
      }
    }
  }

  getBucketInfo(route: string): RouteBucket | null {
    const bucket = this.buckets.get(route);
    if (!bucket) return null;

    const now = Date.now();
    return {
      ...bucket,
      remaining: bucket.resetAt <= now ? bucket.limit : bucket.remaining,
    };
  }

  reset(): void {
    this.buckets.clear();
    this.globalResetAt = 0;
  }

}

/**
 * Maps Discord API endpoints to rate limit route names
 *
 * Discord applies rate limits per route category:
 * - channels:messages: Message endpoints
 * - channels: Other channel operations
 * - guilds: Guild operations
 * - guilds:channels: Guild channel operations
 * - users: User operations
 * - webhooks: Webhook operations
 */
export function extractRoute(endpoint: string): string {
  if (endpoint.includes("messages")) {
    return "channels:messages";
  }

  if (endpoint.includes("channels")) {
    return "channels";
  }

  if (endpoint.includes("guilds")) {
    return endpoint.includes("channels") ? "guilds:channels" : "guilds";
  }

  if (endpoint.includes("users")) {
    return "users";
  }

  if (endpoint.includes("webhooks")) {
    return "webhooks";
  }

  const match = endpoint.match(/(\w+)/);
  return match ? (match[1] ?? "default") : "default";
}

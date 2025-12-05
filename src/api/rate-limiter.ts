import type { RateLimiter } from "./client";
import type { RateLimitInfo } from "../types/discord";
import { delay } from "../utils/delay.js";
import { RATE_LIMIT } from "../utils/constants.js";

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
        // Bucket has expired, reset remaining tokens to full limit
        // The resetAt will be updated on the next API response with fresh rate limit headers
        bucket.remaining = bucket.limit;
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

    if (info.remaining < RATE_LIMIT.LOW_REMAINING_WARNING_THRESHOLD) {
      console.warn(`Rate limit for ${route}: ${info.remaining}/${info.limit} remaining`);
    }
  }

  getGlobalDelay(): number {
    const now = Date.now();
    return Math.max(0, this.globalResetAt - now);
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

  // Check for guilds:channels before channels to properly categorize guild channel endpoints
  if (endpoint.includes("guilds") && endpoint.includes("channels")) {
    return "guilds:channels";
  }

  if (endpoint.includes("channels")) {
    return "channels";
  }

  if (endpoint.includes("guilds")) {
    return "guilds";
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

// Rate limiting implementation using token bucket algorithm

import type { RateLimiter } from "./client";
import type { RateLimitInfo } from "../types/discord";

// Information about a rate limit bucket for a specific route
interface RouteBucket {
  limit: number;
  remaining: number;
  resetAt: number; // Timestamp in milliseconds
  isGlobal: boolean;
}

// Token bucket rate limiter implementation for Discord API
export class TokenBucketRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, RouteBucket>();
  private globalResetAt = 0;
  private readonly defaultLimit = 50; // Discord's typical rate limit

  async checkLimit(route: string): Promise<void> {
    const now = Date.now();

    // Check global rate limit first
    if (this.globalResetAt > now) {
      const delay = this.globalResetAt - now;
      console.warn(`Global rate limit active, waiting ${delay}ms`);
      await this.delay(delay);
    }

    // Check route-specific rate limit
    const bucket = this.buckets.get(route);
    if (bucket) {
      // Reset bucket if timer has expired
      if (bucket.resetAt <= now) {
        bucket.remaining = bucket.limit;
        bucket.resetAt = now + bucket.resetAt - (bucket.resetAt - now);
      }

      // Wait if we've hit the limit
      if (bucket.remaining <= 0) {
        const delay = bucket.resetAt - now;
        console.warn(`Route ${route} rate limit hit, waiting ${delay}ms`);
        await this.delay(delay);
      }
    }
  }

  updateLimit(route: string, info: RateLimitInfo): void {
    const now = Date.now();

    // Handle global rate limit
    if (info.global) {
      this.globalResetAt = now + (info.retryAfter || 0) * 1000;
      console.warn(`Global rate limit hit, reset at ${new Date(this.globalResetAt)}`);
      return;
    }

    // Update route-specific bucket
    const bucket: RouteBucket = {
      limit: info.limit,
      remaining: info.remaining,
      resetAt: now + info.resetAfter * 1000,
      isGlobal: info.global,
    };

    this.buckets.set(route, bucket);

    // Log when rate limit is getting low
    if (info.remaining < 5) {
      console.warn(`Rate limit for ${route}: ${info.remaining}/${info.limit} remaining`);
    }
  }

  getGlobalDelay(): number {
    const now = Date.now();
    return Math.max(0, this.globalResetAt - now);
  }

  // Clean up expired buckets to prevent memory leaks
  cleanup(): void {
    const now = Date.now();
    for (const [route, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(route);
      }
    }
  }

  // Get current rate limit info for a route (for debugging)
  getBucketInfo(route: string): RouteBucket | null {
    const bucket = this.buckets.get(route);
    if (!bucket) return null;

    const now = Date.now();
    return {
      ...bucket,
      remaining: bucket.resetAt <= now ? bucket.limit : bucket.remaining,
    };
  }

  // Reset all rate limits (useful for testing or error recovery)
  reset(): void {
    this.buckets.clear();
    this.globalResetAt = 0;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Extract route from API endpoint for rate limiting
export function extractRoute(endpoint: string): string {
  // Discord rate limits are based on major endpoints
  // Examples:
  // GET channels/123/messages -> channels:messages
  // GET guilds/456 -> guilds
  // POST channels/789/messages -> channels:messages

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

  // Default to the first path segment
  const match = endpoint.match(/(\w+)/);
  return match ? (match[1] ?? "default") : "default";
}
/**
 * Discord API type definitions for the chat exporter
 *
 * Follows gurt philosophy: model ONLY what we need, save raw responses
 */

/**
 * Branded type for Discord snowflake IDs
 * Provides type safety while maintaining string serialization
 */
export type Snowflake = string & { readonly __brand: unique symbol };

/**
 * Minimal message interface containing only fields needed for pagination
 */
export interface Message {
  id: Snowflake;
  channel_id: Snowflake;
  timestamp: string;
}

/**
 * Channel information needed for export operations
 */
export interface Channel {
  id: Snowflake;
  type: number;
  name?: string;
  topic?: string;
  nsfw?: boolean;
  parent_id?: Snowflake;
  recipient_ids?: Snowflake[];
}

/**
 * Guild information needed for channel listings
 */
export interface Guild {
  id: Snowflake;
  name: string;
}

/**
 * Rate limit headers from Discord API responses
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAfter: number;
  retryAfter?: number;
  global: boolean;
}

/**
 * Type-safe constructor for Snowflake IDs
 */
export function createSnowflake(id: string): Snowflake {
  return id as Snowflake;
}
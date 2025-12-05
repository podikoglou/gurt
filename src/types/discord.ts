// Discord API type definitions for the chat exporter
// Following gurt philosophy: model ONLY what we need, save raw responses

// Branded type for Discord snowflake IDs
export type Snowflake = string & { readonly __brand: unique symbol };

// Minimal message type - only what we need for pagination and export
export interface Message {
  id: Snowflake;
  channel_id: Snowflake; // Use Discord's field names
  timestamp: string; // ISO 8601 - needed for sorting
}

// Channel info - minimal needed for export
export interface Channel {
  id: Snowflake;
  type: number; // Discord's channel type number
  name?: string;
  topic?: string;
  nsfw?: boolean;
  parent_id?: Snowflake;
  recipient_ids?: Snowflake[]; // For DMs
}

// Guild info - minimal needed
export interface Guild {
  id: Snowflake;
  name: string;
}

// Rate limit information from Discord API
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAfter: number;
  retryAfter?: number;
  global: boolean;
}

// Helper function to create a snowflake from a string
export function createSnowflake(id: string): Snowflake {
  return id as Snowflake;
}
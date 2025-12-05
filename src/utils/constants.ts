/**
 * Configuration constants for the gurt Discord chat exporter
 *
 * Centralizes magic numbers and configuration values for easier maintenance
 */

/**
 * Discord API configuration
 */
export const DISCORD_API = {
  /** Base URL for Discord API v10 */
  BASE_URL: "https://discord.com/api/v10",

  /** Request timeout in milliseconds */
  REQUEST_TIMEOUT_MS: 30000,

  /** Maximum messages per request (Discord API limit) */
  MAX_MESSAGES_PER_REQUEST: 100,

  /** Default batch size for message fetching */
  DEFAULT_BATCH_SIZE: 100,
} as const;

/**
 * Rate limiting configuration
 */
export const RATE_LIMIT = {
  /** Threshold for remaining requests before logging a warning */
  LOW_REMAINING_WARNING_THRESHOLD: 5,
} as const;

/**
 * Retry configuration defaults
 */
export const RETRY = {
  /** Maximum number of retry attempts */
  MAX_RETRIES: 3,

  /** Base delay between retries in milliseconds */
  BASE_DELAY_MS: 1000,

  /** Maximum delay between retries in milliseconds */
  MAX_DELAY_MS: 10000,

  /** Multiplier for exponential backoff */
  BACKOFF_MULTIPLIER: 2,

  /** HTTP status codes that should trigger a retry */
  RETRYABLE_STATUS_CODES: [429, 500, 502, 503, 504] as readonly number[],
} as const;

/**
 * Discord channel types
 * @see https://discord.com/developers/docs/resources/channel#channel-object-channel-types
 */
export const CHANNEL_TYPES = {
  GUILD_TEXT: 0,
  DM: 1,
  GUILD_VOICE: 2,
  GROUP_DM: 3,
  GUILD_CATEGORY: 4,
  GUILD_ANNOUNCEMENT: 5,
  ANNOUNCEMENT_THREAD: 10,
  PUBLIC_THREAD: 11,
  PRIVATE_THREAD: 12,
  GUILD_STAGE_VOICE: 13,
  GUILD_DIRECTORY: 14,
  GUILD_FORUM: 15,
} as const;

/**
 * Display names for channel types (with emoji)
 */
export const CHANNEL_TYPE_DISPLAY: Record<number, string> = {
  [CHANNEL_TYPES.GUILD_TEXT]: "📝 Text",
  [CHANNEL_TYPES.DM]: "💬 DM",
  [CHANNEL_TYPES.GUILD_VOICE]: "🔊 Voice",
  [CHANNEL_TYPES.GROUP_DM]: "👥 Group DM",
  [CHANNEL_TYPES.GUILD_CATEGORY]: "📁 Category",
  [CHANNEL_TYPES.GUILD_ANNOUNCEMENT]: "📢 Announcement",
  [CHANNEL_TYPES.ANNOUNCEMENT_THREAD]: "🧵 Announcement Thread",
  [CHANNEL_TYPES.PUBLIC_THREAD]: "🧵 Public Thread",
  [CHANNEL_TYPES.PRIVATE_THREAD]: "🔒 Private Thread",
  [CHANNEL_TYPES.GUILD_STAGE_VOICE]: "🎤 Stage",
  [CHANNEL_TYPES.GUILD_DIRECTORY]: "📋 Directory",
  [CHANNEL_TYPES.GUILD_FORUM]: "💬 Forum",
} as const;

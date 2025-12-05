// Discord API type definitions for the chat exporter
// Focused on minimal but complete types needed for exporting

// Branded type for Discord snowflake IDs
export type Snowflake = string & { readonly __brand: unique symbol };

// User/Author object - contains essential user information
export interface User {
  id: Snowflake;
  username: string;
  discriminator: string;
  globalName: string | null;
  avatar: string | null;
  bot: boolean;
  system: boolean;
}

// Message object - core data structure for chat export
export interface Message {
  id: Snowflake;
  channelId: Snowflake;
  author: User;
  content: string;
  timestamp: string; // ISO 8601
  editedTimestamp: string | null;
  attachments: Attachment[];
  embeds: Embed[];
  mentions: User[];
  mentionRoles: Snowflake[];
  pinned: boolean;
  type: MessageType;
  thread?: MessageThread; // Present only for thread creation messages
  referencedMessage: Message | null; // For replies
  components: MessageComponent[]; // For interactive messages
  reactions: MessageReaction[]; // Reactions to the message
}

// Attachment subset - only essential fields for export
export interface Attachment {
  id: Snowflake;
  filename: string;
  description: string | null;
  contentType: string | null;
  size: number;
  url: string;
  proxyUrl: string;
  width: number | null;
  height: number | null;
  ephemeral: boolean;
}

// Embed subset - fields commonly used in messages
export interface Embed {
  title: string | null;
  description: string | null;
  url: string | null;
  timestamp: string | null;
  color: number | null;
  footer: {
    text: string | null;
    iconUrl: string | null;
  };
  author: {
    name: string | null;
    url: string | null;
    iconUrl: string | null;
  };
  image: {
    url: string | null;
    proxyUrl: string | null;
    width: number | null;
    height: number | null;
  };
  thumbnail: {
    url: string | null;
    proxyUrl: string | null;
    width: number | null;
    height: number | null;
  };
  video: {
    url: string | null;
    proxyUrl: string | null;
    width: number | null;
    height: number | null;
  };
  fields: EmbedField[];
}

export interface EmbedField {
  name: string;
  value: string;
  inline: boolean;
}

// Message thread information
export interface MessageThread {
  id: Snowflake;
  name: string;
  type: ChannelType;
}

// Message component (buttons, select menus, etc.)
export interface MessageComponent {
  type: number;
  components: MessageComponent[];
}

// Message reaction
export interface MessageReaction {
  emoji: {
    id: Snowflake | null;
    name: string | null;
    animated: boolean;
  };
  count: number;
  me: boolean;
}

// Channel object - essential channel information
export interface Channel {
  id: Snowflake;
  type: ChannelType;
  guildId: Snowflake | null; // null for DMs and group DMs
  name: string | null; // null for DMs
  topic: string | null;
  nsfw: boolean;
  lastMessageId: Snowflake | null;
  parentId: Snowflake | null; // For threads
  rateLimitPerUser: number;
  recipientIds: Snowflake[]; // For DMs and group DMs
  ownerId: Snowflake | null; // For group DMs
  permissions: string | null; // Permission overwrite string
}

// Guild object - minimal guild information
export interface Guild {
  id: Snowflake;
  name: string;
  icon: string | null;
  ownerId: Snowflake;
  features: string[];
  memberCount: number | null;
}

// Enum for message types
export enum MessageType {
  DEFAULT = 0,
  RECIPIENT_ADD = 1,
  RECIPIENT_REMOVE = 2,
  CALL = 3,
  CHANNEL_NAME_CHANGE = 4,
  CHANNEL_ICON_CHANGE = 5,
  CHANNEL_PINNED_MESSAGE = 6,
  GUILD_MEMBER_JOIN = 7,
  USER_PREMIUM_GUILD_SUBSCRIPTION = 8,
  USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_1 = 9,
  USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_2 = 10,
  USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_3 = 11,
  CHANNEL_FOLLOW_ADD = 12,
  GUILD_DISCOVERY_DISQUALIFIED = 14,
  GUILD_DISCOVERY_REQUALIFIED = 15,
  GUILD_DISCOVERY_GRACE_PERIOD_INITIAL_WARNING = 16,
  GUILD_DISCOVERY_GRACE_PERIOD_FINAL_WARNING = 17,
  THREAD_CREATED = 18,
  REPLY = 19,
  APPLICATION_COMMAND = 20,
  THREAD_STARTER_MESSAGE = 21,
  GUILD_INVITE_REMINDER = 22,
  CONTEXT_MENU_COMMAND = 23,
  AUTO_MODERATION_ACTION = 24,
  ROLE_SUBSCRIPTION_PURCHASE = 25,
  INTERACTION_PREMIUM_UPSELL = 26,
  STAGE_START = 27,
  STAGE_END = 28,
  STAGE_SPEAKER = 29,
  STAGE_TOPIC = 30,
  GUILD_APPLICATION_PREMIUM_SUBSCRIPTION = 32,
}

// Enum for channel types
export enum ChannelType {
  GUILD_TEXT = 0,
  DM = 1,
  GUILD_VOICE = 2,
  GROUP_DM = 3,
  GUILD_CATEGORY = 4,
  GUILD_ANNOUNCEMENT = 5,
  ANNOUNCEMENT_THREAD = 10,
  PUBLIC_THREAD = 11,
  PRIVATE_THREAD = 12,
  GUILD_STAGE_VOICE = 13,
  GUILD_DIRECTORY = 14,
  GUILD_FORUM = 15,
}

// API response structures
export interface DiscordApiResponse<T> {
  data: T;
  code?: number;
  message?: string;
  errors?: Record<string, unknown>;
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
  // Basic validation for Discord snowflake format
  if (!/^\d{17,19}$/.test(id)) {
    throw new Error(`Invalid snowflake ID: ${id}`);
  }
  return id as Snowflake;
}

// Helper to check if a value is a snowflake
export function isSnowflake(value: unknown): value is Snowflake {
  return typeof value === "string" && /^\d{17,19}$/.test(value);
}
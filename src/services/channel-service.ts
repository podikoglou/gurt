// Channel and guild service for fetching Discord channel information

import type { DiscordApiClient } from "../api/discord-client.js";
import type { Channel, Guild, Snowflake } from "../types/discord.js";

// Service for fetching channel and guild information
export class ChannelService {
  constructor(private readonly apiClient: DiscordApiClient) {}

  // Get all DM channels
  async getDmChannels(): Promise<Channel[]> {
    try {
      const channels = await this.apiClient.getDmChannels();
      // Filter to only show DM channels (not group DMs)
      return channels.filter(channel => channel.type === 1);
    } catch (error) {
      console.error("Failed to fetch DM channels:", error);
      throw error;
    }
  }

  // Get all group DM channels
  async getGroupDmChannels(): Promise<Channel[]> {
    try {
      const channels = await this.apiClient.getDmChannels();
      // Filter to only show group DMs
      return channels.filter(channel => channel.type === 3);
    } catch (error) {
      console.error("Failed to fetch group DM channels:", error);
      throw error;
    }
  }

  // Get all accessible guilds
  async getGuilds(): Promise<Guild[]> {
    try {
      return await this.apiClient.getGuilds();
    } catch (error) {
      console.error("Failed to fetch guilds:", error);
      throw error;
    }
  }

  // Get all channels in a guild
  async getGuildChannels(guildId: Snowflake): Promise<Channel[]> {
    try {
      const channels = await this.apiClient.getGuildChannels(guildId);

      // Sort channels by type and position (Discord's default order)
      return channels.sort((a, b) => {
        // Categories first, then text channels, then voice channels
        const typeOrder = {
          4: 0, // GUILD_CATEGORY
          0: 1, // GUILD_TEXT
          5: 1, // GUILD_ANNOUNCEMENT
          2: 2, // GUILD_VOICE
          13: 2, // GUILD_STAGE_VOICE
          15: 2, // GUILD_FORUM
        };

        const aOrder = typeOrder[a.type as keyof typeof typeOrder] ?? 3;
        const bOrder = typeOrder[b.type as keyof typeof typeOrder] ?? 3;

        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }

        // Within same type, sort by position if available
        // Note: Discord doesn't always return position in API
        const aName = a.name || "";
        const bName = b.name || "";
        return aName.localeCompare(bName);
      });
    } catch (error) {
      console.error(`Failed to fetch channels for guild ${guildId}:`, error);
      throw error;
    }
  }

  // Get text channels only from a guild
  async getGuildTextChannels(guildId: Snowflake): Promise<Channel[]> {
    const channels = await this.getGuildChannels(guildId);
    return channels.filter(channel =>
      channel.type === 0 || // GUILD_TEXT
      channel.type === 5    // GUILD_ANNOUNCEMENT
    );
  }

  // Get a specific channel by ID
  async getChannel(channelId: Snowflake): Promise<Channel | null> {
    try {
      return await this.apiClient.getChannel(channelId);
    } catch (error) {
      if (error instanceof Error && error.message.includes("404")) {
        return null;
      }
      throw error;
    }
  }

  // Get channel with additional information
  async getChannelInfo(channelId: Snowflake): Promise<{
    channel: Channel;
    guild?: Guild;
    isDm: boolean;
    isGroupDm: boolean;
    isGuildChannel: boolean;
  } | null> {
    const channel = await this.getChannel(channelId);
    if (!channel) return null;

    const isDm = channel.type === 1;
    const isGroupDm = channel.type === 3;
    const isGuildChannel = !isDm && !isGroupDm;

    let guild: Guild | undefined;
    if (isGuildChannel && channel.guildId) {
      try {
        // Try to get guild from cached guilds
        const guilds = await this.getGuilds();
        guild = guilds.find(g => g.id === channel.guildId);
      } catch (error) {
        // Ignore if we can't fetch guild info
        console.warn(`Could not fetch guild info for channel ${channelId}:`, error);
      }
    }

    return {
      channel,
      guild,
      isDm,
      isGroupDm,
      isGuildChannel,
    };
  }

  // Search channels by name
  async searchChannels(query: string, guildId?: Snowflake): Promise<Channel[]> {
    const channels = guildId
      ? await this.getGuildChannels(guildId)
      : [...await this.getDmChannels(), ...await this.getGroupDmChannels()];

    const queryLower = query.toLowerCase();
    return channels.filter(channel =>
      (channel.name && channel.name.toLowerCase().includes(queryLower)) ||
      (channel.topic && channel.topic.toLowerCase().includes(queryLower))
    );
  }

  // Get channels that the user can read messages in
  async getReadableChannels(guildId: Snowflake): Promise<Channel[]> {
    const channels = await this.getGuildTextChannels(guildId);

    // Filter out channels without read permissions
    // Note: We can't definitively check permissions without more complex logic
    // This is a basic filter - channels without names are often inaccessible
    return channels.filter(channel => {
      // Most accessible channels have names
      return channel.name != null;
    });
  }

  // Get channel statistics
  getChannelStats(channel: Channel): {
    type: string;
    isNsfw: boolean;
    hasTopic: boolean;
    rateLimit: number;
    category: string | null;
  } {
    const typeNames = {
      0: "Text Channel",
      1: "DM",
      2: "Voice Channel",
      3: "Group DM",
      4: "Category",
      5: "Announcement Channel",
      10: "Announcement Thread",
      11: "Public Thread",
      12: "Private Thread",
      13: "Stage Channel",
      14: "Guild Directory",
      15: "Guild Forum",
    };

    return {
      type: typeNames[channel.type as keyof typeof typeNames] || "Unknown",
      isNsfw: channel.nsfw,
      hasTopic: !!channel.topic,
      rateLimit: channel.rateLimitPerUser,
      category: channel.parentId ? `Category ${channel.parentId}` : null,
    };
  }

  // Format channel name for display
  formatChannelName(channel: Channel): string {
    if (channel.type === 1) {
      // DM - show other user's name if available
      return "Direct Message";
    } else if (channel.type === 3) {
      // Group DM
      return channel.name || "Group DM";
    } else {
      // Guild channel
      return channel.name || "Unknown Channel";
    }
  }

  // Get channel type display name
  getChannelTypeDisplay(channel: Channel): string {
    const typeNames = {
      0: "📝 Text",
      1: "💬 DM",
      2: "🔊 Voice",
      3: "👥 Group DM",
      4: "📁 Category",
      5: "📢 Announcement",
      10: "🧵 Announcement Thread",
      11: "🧵 Public Thread",
      12: "🔒 Private Thread",
      13: "🎤 Stage",
      14: "📋 Directory",
      15: "💬 Forum",
    };

    return typeNames[channel.type as keyof typeof typeNames] || "❓ Unknown";
  }
}
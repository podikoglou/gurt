import type { DiscordApiClient } from "../api/discord-client.js";
import type { Channel, Guild, Snowflake } from "../types/discord.js";
import { CHANNEL_TYPES, CHANNEL_TYPE_DISPLAY } from "../utils/constants.js";

/**
 * Service for managing Discord channel operations
 *
 * Handles:
 * - Direct message channels
 * - Guild channels and categories
 * - Channel type formatting and display
 */
export class ChannelService {
  constructor(private readonly apiClient: DiscordApiClient) {}

  async getDmChannels(): Promise<Channel[]> {
    const channels = await this.apiClient.getDmChannels();
    return (channels as any[]).map(this.formatChannel).filter(c => c.type === CHANNEL_TYPES.DM);
  }

  async getGroupDmChannels(): Promise<Channel[]> {
    const channels = await this.apiClient.getDmChannels();
    return (channels as any[]).map(this.formatChannel).filter(c => c.type === CHANNEL_TYPES.GROUP_DM);
  }

  async getGuilds(): Promise<Guild[]> {
    const guilds = await this.apiClient.getGuilds();
    return (guilds as any[]).map(g => ({
      id: g.id,
      name: g.name,
    }));
  }

  async getGuildChannels(guildId: Snowflake): Promise<Channel[]> {
    const channels = await this.apiClient.getGuildChannels(guildId);
    return (channels as any[]).map(this.formatChannel);
  }

  async getGuildTextChannels(guildId: Snowflake): Promise<Channel[]> {
    const channels = await this.getGuildChannels(guildId);
    return channels.filter(c => c.type === CHANNEL_TYPES.GUILD_TEXT || c.type === CHANNEL_TYPES.GUILD_ANNOUNCEMENT);
  }

  async getChannel(channelId: Snowflake): Promise<Channel> {
    const channel = await this.apiClient.getChannel(channelId);
    return this.formatChannel(channel);
  }

  private formatChannel = (channel: any): Channel => {
    return {
      id: channel.id,
      type: channel.type,
      name: channel.name,
      topic: channel.topic,
      nsfw: channel.nsfw,
      parent_id: channel.parent_id,
      recipient_ids: channel.recipients?.map((r: any) => r.id),
    };
  };

  formatChannelName(channel: Channel): string {
    if (channel.type === CHANNEL_TYPES.DM) {
      return "Direct Message";
    } else if (channel.type === CHANNEL_TYPES.GROUP_DM) {
      return channel.name || "Group DM";
    } else {
      return channel.name || "Unknown Channel";
    }
  }

  /**
   * Get a human-readable display name for a channel type
   * @see CHANNEL_TYPES for the numeric type values
   */
  getChannelTypeDisplay(channel: Channel): string {
    return CHANNEL_TYPE_DISPLAY[channel.type] || "❓ Unknown";
  }
}

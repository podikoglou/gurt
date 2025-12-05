import type { DiscordApiClient } from "../api/discord-client.js";
import type { Channel, Guild, Snowflake } from "../types/discord.js";

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
    return (channels as any[]).map(this.formatChannel).filter(c => c.type === 1);
  }

  async getGroupDmChannels(): Promise<Channel[]> {
    const channels = await this.apiClient.getDmChannels();
    return (channels as any[]).map(this.formatChannel).filter(c => c.type === 3);
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
    return channels.filter(c => c.type === 0 || c.type === 5);
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
    if (channel.type === 1) {
      return "Direct Message";
    } else if (channel.type === 3) {
      return channel.name || "Group DM";
    } else {
      return channel.name || "Unknown Channel";
    }
  }

  /**
   * Discord channel types:
   * 0: Text, 1: DM, 2: Voice, 3: Group DM, 4: Category, 5: Announcement
   * 10-12: Threads, 13: Stage, 14: Directory, 15: Forum
   */
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
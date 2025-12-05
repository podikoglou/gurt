// Channel service - works with raw Discord responses

import type { DiscordApiClient } from "../api/discord-client.js";
import type { Channel, Guild, Snowflake } from "../types/discord.js";

// Service for channel operations
export class ChannelService {
  constructor(private readonly apiClient: DiscordApiClient) {}

  // Get DM channels
  async getDmChannels(): Promise<Channel[]> {
    const channels = await this.apiClient.getDmChannels();
    return (channels as any[]).map(this.formatChannel).filter(c => c.type === 1);
  }

  // Get group DM channels
  async getGroupDmChannels(): Promise<Channel[]> {
    const channels = await this.apiClient.getDmChannels();
    return (channels as any[]).map(this.formatChannel).filter(c => c.type === 3);
  }

  // Get guilds
  async getGuilds(): Promise<Guild[]> {
    const guilds = await this.apiClient.getGuilds();
    return (guilds as any[]).map(g => ({
      id: g.id,
      name: g.name,
    }));
  }

  // Get channels in a guild
  async getGuildChannels(guildId: Snowflake): Promise<Channel[]> {
    const channels = await this.apiClient.getGuildChannels(guildId);
    return (channels as any[]).map(this.formatChannel);
  }

  // Get only text channels from a guild
  async getGuildTextChannels(guildId: Snowflake): Promise<Channel[]> {
    const channels = await this.getGuildChannels(guildId);
    // Filter for text channels (type 0) and announcement channels (type 5)
    return channels.filter(c => c.type === 0 || c.type === 5);
  }

  // Get channel info
  async getChannel(channelId: Snowflake): Promise<Channel> {
    const channel = await this.apiClient.getChannel(channelId);
    return this.formatChannel(channel);
  }

  // Format channel from raw Discord response
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
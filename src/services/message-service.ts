// Message fetching service with pagination and filtering

import type { DiscordApiClient } from "../api/discord-client.js";
import type { Message, Snowflake } from "../types/discord.js";
import type { ExportConfig, ExportProgress } from "../types/export.js";

// Service for fetching and processing Discord messages
export class MessageService {
  constructor(private readonly apiClient: DiscordApiClient) {}

  // Fetch messages with pagination using async generator for memory efficiency
  async *fetchMessagesPaginated(
    channelId: Snowflake,
    config: Partial<ExportConfig> = {},
    onProgress?: (progress: ExportProgress) => void
  ): AsyncGenerator<Message[], void, unknown> {
    const batchSize = Math.min(config.batchSize || 100, 100); // Discord max is 100
    const sortBy = config.sortBy || "oldest";
    const limit = config.limit;

    let hasMore = true;
    let cursor: Snowflake | undefined;
    let totalCount = 0;
    const startTime = Date.now();

    while (hasMore && (!limit || totalCount < limit)) {
      try {
        // Adjust batch size if we're approaching the limit
        const currentBatchSize = limit
          ? Math.min(batchSize, limit - totalCount)
          : batchSize;

        const messages = await this.apiClient.getMessages(channelId, {
          limit: currentBatchSize,
          ...(sortBy === "oldest" && cursor ? { after: cursor } : {}),
          ...(sortBy === "newest" && cursor ? { before: cursor } : {}),
        });

        if (messages.length === 0) {
          hasMore = false;
        } else {
          // Update cursor based on sort direction
          cursor = sortBy === "oldest"
            ? messages[messages.length - 1]?.id
            : messages[0]?.id;

          // Apply filters if provided
          const filteredMessages = config.filters
            ? this.applyFilters(messages, config.filters)
            : messages;

          // Apply date range filter if specified
          const finalMessages = config.dateRange
            ? this.applyDateRange(filteredMessages, config.dateRange)
            : filteredMessages;

          // Update total count
          totalCount += finalMessages.length;

          // Calculate progress
          const elapsed = Date.now() - startTime;
          const rate = totalCount / (elapsed / 1000); // messages per second

          if (onProgress) {
            onProgress({
              messageCount: totalCount,
              totalCount: limit,
              percentage: limit ? (totalCount / limit) * 100 : 0,
              currentMessage: finalMessages[finalMessages.length - 1],
              rate,
              eta: rate > 0 && limit ? (limit - totalCount) / rate : undefined,
            });
          }

          if (finalMessages.length > 0) {
            yield finalMessages;
          }

          // Check if we've got all messages or hit the limit
          hasMore = messages.length === currentBatchSize && (!limit || totalCount < limit);
        }
      } catch (error) {
        console.error(`Failed to fetch messages for channel ${channelId}:`, error);
        throw error;
      }
    }
  }

  // Fetch all messages and return as an array (for small channels)
  async fetchAllMessages(
    channelId: Snowflake,
    config: Partial<ExportConfig> = {},
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Message[]> {
    const allMessages: Message[] = [];

    for await (const batch of this.fetchMessagesPaginated(channelId, config, onProgress)) {
      allMessages.push(...batch);
    }

    // Sort messages chronologically
    allMessages.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return allMessages;
  }

  // Get a single message by ID
  async getMessage(channelId: Snowflake, messageId: Snowflake): Promise<Message | null> {
    try {
      return await this.apiClient.getMessage(channelId, messageId);
    } catch (error) {
      if (error instanceof Error && error.message.includes("404")) {
        return null;
      }
      throw error;
    }
  }

  // Get message count estimate (for progress tracking)
  async getMessageCount(channelId: Snowflake): Promise<number | null> {
    try {
      // Fetch a small batch to see if messages exist
      const messages = await this.apiClient.getMessages(channelId, { limit: 1 });

      if (messages.length === 0) {
        return 0;
      }

      // We can't get exact count without fetching all messages
      // So return null to indicate unknown count
      return null;
    } catch (error) {
      console.error(`Failed to get message count for channel ${channelId}:`, error);
      return null;
    }
  }

  // Apply filters to messages
  private applyFilters(messages: Message[], filters: ExportConfig["filters"]): Message[] {
    if (!filters || filters.length === 0) return messages;

    return messages.filter(message =>
      filters.every(filter => {
        switch (filter.type) {
          case "user":
          case "authorId":
            return message.author.id === filter.value;
          case "content":
            if (filter.value instanceof RegExp) {
              return filter.value.test(message.content);
            }
            return message.content.includes(filter.value as string);
          case "date":
            const messageDate = new Date(message.timestamp);
            if (filter.value instanceof Date) {
              return messageDate.toDateString() === filter.value.toDateString();
            }
            return false;
          case "hasAttachments":
            return filter.value ? message.attachments.length > 0 : message.attachments.length === 0;
          case "hasEmbeds":
            return filter.value ? message.embeds.length > 0 : message.embeds.length === 0;
          default:
            return true;
        }
      })
    );
  }

  // Apply date range filter
  private applyDateRange(messages: Message[], dateRange: { from: Date; to: Date }): Message[] {
    return messages.filter(message => {
      const messageDate = new Date(message.timestamp);
      return messageDate >= dateRange.from && messageDate <= dateRange.to;
    });
  }

  // Search messages by content (basic implementation)
  async *searchMessages(
    channelId: Snowflake,
    query: string,
    config: Partial<ExportConfig> = {}
  ): AsyncGenerator<Message[], void, unknown> {
    const searchFilter: ExportConfig["filters"] = [
      {
        type: "content",
        value: query,
      },
    ];

    const searchConfig = {
      ...config,
      filters: [...(config.filters || []), ...searchFilter],
    };

    yield* this.fetchMessagesPaginated(channelId, searchConfig);
  }

  // Get message statistics
  getMessageStats(messages: Message[]): {
    totalMessages: number;
    uniqueAuthors: number;
    attachments: number;
    embeds: number;
    reactions: number;
    dateRange: { first: Date; last: Date } | null;
  } {
    const uniqueAuthors = new Set(messages.map(m => m.author.id)).size;
    const attachments = messages.reduce((sum, m) => sum + m.attachments.length, 0);
    const embeds = messages.reduce((sum, m) => sum + m.embeds.length, 0);
    const reactions = messages.reduce((sum, m) => sum + m.reactions.length, 0);

    const timestamps = messages
      .map(m => new Date(m.timestamp))
      .filter(d => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    const dateRange = timestamps.length > 0
      ? { first: timestamps[0]!, last: timestamps[timestamps.length - 1]! }
      : null;

    return {
      totalMessages: messages.length,
      uniqueAuthors,
      attachments,
      embeds,
      reactions,
      dateRange,
    };
  }
}
// Message fetching service - works with raw Discord responses

import type { DiscordApiClient } from "../api/discord-client.js";
import type { Message, Snowflake } from "../types/discord.js";
import type { ExportConfig, ExportProgress } from "../types/export.js";

// Service for fetching Discord messages
export class MessageService {
  constructor(private readonly apiClient: DiscordApiClient) {}

  // Fetch messages with pagination using async generator for memory efficiency
  async *fetchMessagesPaginated(
    channelId: Snowflake,
    config: Partial<ExportConfig> = {},
    onProgress?: (progress: ExportProgress) => void
  ): AsyncGenerator<unknown[], void, unknown> {
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
          // Extract minimal info for cursor from raw response
          const firstMessage = messages[0] as any;
          const lastMessage = messages[messages.length - 1] as any;

          // Update cursor based on sort direction
          cursor = sortBy === "oldest" ? lastMessage?.id : firstMessage?.id;

          // Update total count
          totalCount += messages.length;

          // Calculate progress
          const elapsed = Date.now() - startTime;
          const rate = totalCount / (elapsed / 1000); // messages per second

          if (onProgress) {
            onProgress({
              messageCount: totalCount,
              totalCount: limit,
              percentage: limit ? (totalCount / limit) * 100 : 0,
              currentMessage: lastMessage,
              rate,
              eta: rate > 0 && limit ? (limit - totalCount) / rate : undefined,
            });
          }

          yield messages;

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
  ): Promise<unknown[]> {
    const allMessages: unknown[] = [];

    for await (const batch of this.fetchMessagesPaginated(channelId, config, onProgress)) {
      allMessages.push(...batch);
    }

    // Sort messages chronologically using raw timestamps
    allMessages.sort((a: any, b: any) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return allMessages;
  }
}
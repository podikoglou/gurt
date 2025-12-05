import type { DiscordApiClient } from "../api/discord-client.js";
import type { Message, Snowflake } from "../types/discord.js";
import type { ExportConfig, ExportProgress } from "../types/export.js";

/**
 * Service for fetching Discord messages with pagination
 *
 * Features:
 * - Memory-efficient async generator for large channels
 * - Progress tracking with rate calculation
 * - Respect for Discord's rate limits
 */
export class MessageService {
  constructor(private readonly apiClient: DiscordApiClient) {}

  async *fetchMessagesPaginated(
    channelId: Snowflake,
    config: Partial<ExportConfig> = {},
    onProgress?: (progress: ExportProgress) => void
  ): AsyncGenerator<unknown[], void, unknown> {
    const batchSize = Math.min(config.batchSize || 100, 100);
    const sortBy = config.sortBy || "oldest";
    const limit = config.limit;

    let hasMore = true;
    let cursor: Snowflake | undefined;
    let totalCount = 0;
    const startTime = Date.now();

    while (hasMore && (!limit || totalCount < limit)) {
      try {
        const currentBatchSize = limit
          ? Math.min(batchSize, limit - totalCount)
          : batchSize;

        const messages = await this.apiClient.getMessages(channelId, {
          limit: currentBatchSize,
          ...(cursor ? { before: cursor } : {}),
        });

        if (messages.length === 0) {
          hasMore = false;
        } else {
          const lastMessage = messages[messages.length - 1] as any;

          cursor = lastMessage?.id;

          totalCount += messages.length;

          const elapsed = Date.now() - startTime;
          const rate = totalCount / (elapsed / 1000);

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

          hasMore = messages.length > 0 && (!limit || totalCount < limit);
        }
      } catch (error) {
        console.error(`Failed to fetch messages for channel ${channelId}:`, error);
        throw error;
      }
    }
  }

  async fetchAllMessages(
    channelId: Snowflake,
    config: Partial<ExportConfig> = {},
    onProgress?: (progress: ExportProgress) => void
  ): Promise<unknown[]> {
    const allMessages: unknown[] = [];

    for await (const batch of this.fetchMessagesPaginated(channelId, config, onProgress)) {
      allMessages.push(...batch);
    }

    allMessages.sort((a: any, b: any) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return allMessages;
  }
}
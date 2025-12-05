import type { MessageService } from "../services/message-service.js";
import type { ChannelService } from "../services/channel-service.js";
import type { ExportConfig, ExportResult, ExportProgress } from "../types/export.js";
import type { Snowflake } from "../types/discord.js";

/**
 * Orchestrates the export process for Discord channels
 *
 * Coordinates between:
 * - Message fetching with pagination
 * - Channel validation
 * - Export format handling
 */
export class ExportOrchestrator {
  constructor(
    private readonly messageService: MessageService,
    private readonly channelService: ChannelService,
    private readonly exporters: Map<string, any>
  ) {}

  async exportChannel(
    config: ExportConfig,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<ExportResult> {
    const startTime = Date.now();

    try {
      this.validateConfig(config);

      const exporter = this.exporters.get(config.format);
      if (!exporter) {
        throw new Error(`Unsupported export format: ${config.format}`);
      }

      const channel = await this.channelService.getChannel(config.channelId as Snowflake);
      if (!channel) {
        throw new Error(`Channel ${config.channelId} not found or inaccessible`);
      }

      console.log(`Starting export of channel: ${this.channelService.formatChannelName(channel)}`);

      const allMessages: unknown[] = [];

      for await (const batch of this.messageService.fetchMessagesPaginated(
        config.channelId as Snowflake,
        config,
        (progress) => {
          if (onProgress) {
            onProgress(progress);
          }
        }
      )) {
        allMessages.push(...batch);
      }

      console.log(`Collected ${allMessages.length} messages`);

      const result = await exporter.export(allMessages, config.outputPath);

      console.log(`Export completed: ${result.file} (${this.formatFileSize(result.size)})`);

      return {
        ...result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      console.error(`Export failed for channel ${config.channelId}:`, error);
      throw error;
    }
  }

  private validateConfig(config: ExportConfig): void {
    if (!config.channelId) {
      throw new Error("Channel ID is required");
    }

    if (!config.outputPath) {
      throw new Error("Output path is required");
    }

    if (!config.format) {
      throw new Error("Export format is required");
    }

    if (config.batchSize && (config.batchSize < 1 || config.batchSize > 100)) {
      throw new Error("Batch size must be between 1 and 100");
    }

    if (config.limit && config.limit < 1) {
      throw new Error("Message limit must be greater than 0");
    }

    if (config.dateRange) {
      if (config.dateRange.from >= config.dateRange.to) {
        throw new Error("Date range 'from' must be before 'to'");
      }
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
  }

  createExportConfig(args: {
    channel: string;
    output: string;
    format?: string;
    batchSize?: number;
  }): ExportConfig {
    return {
      channelId: args.channel,
      outputPath: args.output,
      format: (args.format as any) || "json",
      batchSize: args.batchSize || 100,
    };
  }
}
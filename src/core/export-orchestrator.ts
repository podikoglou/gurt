import type { MessageService } from "../services/message-service.js";
import type { ChannelService } from "../services/channel-service.js";
import type {
  ExportConfig,
  ExportResult,
  ExportProgress,
  ExporterFactory,
} from "../types/export.js";
import type { Snowflake } from "../types/discord.js";

/**
 * Orchestrates the export process for Discord channels
 *
 * Coordinates between:
 * - Message fetching with pagination
 * - Channel validation
 * - Export format handling via the Exporter lifecycle
 */
export class ExportOrchestrator {
  constructor(
    private readonly messageService: MessageService,
    private readonly channelService: ChannelService,
    private readonly exporterFactories: Map<string, ExporterFactory>
  ) {}

  async exportChannel(
    config: ExportConfig,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<ExportResult> {
    const startTime = Date.now();

    try {
      this.validateConfig(config);

      const exporterFactory = this.exporterFactories.get(config.format);
      if (!exporterFactory) {
        throw new Error(`Unsupported export format: ${config.format}`);
      }

      const channel = await this.channelService.getChannel(config.channelId as Snowflake);
      if (!channel) {
        throw new Error(`Channel ${config.channelId} not found or inaccessible`);
      }

      // Create a fresh exporter instance for this export
      const exporter = exporterFactory();

      // Initialize the exporter with output path and options
      await exporter.open(config.outputPath, {
        streaming: config.streaming ?? true, // Default to streaming for resumability
      });

      try {
        // Stream messages through the exporter
        for await (const batch of this.messageService.fetchMessagesPaginated(
          config.channelId as Snowflake,
          config,
          (progress) => {
            if (onProgress) {
              onProgress(progress);
            }
          }
        )) {
          await exporter.write(batch);
        }

        // Finalize the export
        const result = await exporter.close();

        return {
          ...result,
          duration: Date.now() - startTime,
        };
      } catch (error) {
        // Attempt to close the exporter on error to ensure proper cleanup
        try {
          await exporter.close();
        } catch {
          // Ignore close errors during error handling
        }
        throw error;
      }
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

  /**
   * Continue an export from an existing partial export file
   *
   * @param continuePath - Path to the existing export file
   * @param format - Export format (json, jsonl, csv)
   * @param channelId - The channel ID (validated against the export file)
   * @param onProgress - Optional progress callback
   * @returns Export result with combined message counts
   */
  async continueExport(
    continuePath: string,
    format: string,
    channelId: string,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<ExportResult> {
    const startTime = Date.now();

    const exporterFactory = this.exporterFactories.get(format);
    if (!exporterFactory) {
      throw new Error(`Unsupported export format: ${format}`);
    }

    // Create a temporary exporter instance just to parse the resume info
    const tempExporter = exporterFactory();
    const resumeInfo = await tempExporter.parseResumeInfo(continuePath);

    // Validate that the provided channel ID matches the export file
    if (resumeInfo.channelId !== channelId) {
      throw new Error(
        `Channel ID mismatch: export file is from channel ${resumeInfo.channelId}, ` +
        `but you specified channel ${channelId}`
      );
    }

    console.log(`Found ${resumeInfo.existingMessageCount} existing messages, resuming...`);

    // Create a fresh exporter for the actual export
    const exporter = exporterFactory();

    // Initialize in resume mode
    await exporter.openForResume(continuePath, resumeInfo, {
      streaming: true, // Always use streaming for resume to ensure data safety
    });

    try {
      let newMessageCount = 0;

      // Stream messages through the exporter, starting BEFORE the oldest existing message
      for await (const batch of this.messageService.fetchMessagesPaginated(
        channelId as Snowflake,
        {
          batchSize: 100,
          resumeFromMessageId: resumeInfo.lastMessageId,
        },
        (progress) => {
          if (onProgress) {
            // Report combined progress
            onProgress({
              messageCount: resumeInfo.existingMessageCount + progress.messageCount,
              rate: progress.rate,
            });
          }
        }
      )) {
        await exporter.write(batch);
        newMessageCount += batch.length;
      }

      // Finalize the export
      const result = await exporter.close();

      return {
        ...result,
        messageCount: resumeInfo.existingMessageCount + newMessageCount,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      // Attempt to close the exporter on error to ensure proper cleanup
      try {
        await exporter.close();
      } catch {
        // Ignore close errors during error handling
      }
      throw error;
    }
  }

  createExportConfig(args: {
    channel: string;
    output: string;
    format?: string;
    batchSize?: number;
    streaming?: boolean;
  }): ExportConfig {
    return {
      channelId: args.channel,
      outputPath: args.output,
      format: (args.format as any) || "json",
      batchSize: args.batchSize || 100,
      streaming: args.streaming ?? true,
    };
  }
}

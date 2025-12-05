// Main export orchestration logic

import type { MessageService } from "../services/message-service.js";
import type { ChannelService } from "../services/channel-service.js";
import type { MessageExporter } from "../exporters/base.js";
import type { ExportConfig, ExportResult, ExportProgress } from "../types/export.js";
import type { Snowflake } from "../types/discord.js";

// Main orchestrator for the export process
export class ExportOrchestrator {
  constructor(
    private readonly messageService: MessageService,
    private readonly channelService: ChannelService,
    private readonly exporters: Map<string, MessageExporter>
  ) {}

  // Export a channel with full configuration
  async exportChannel(
    config: ExportConfig,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<ExportResult> {
    const startTime = Date.now();

    try {
      // Validate configuration
      this.validateConfig(config);

      // Get appropriate exporter
      const exporter = this.exporters.get(config.format);
      if (!exporter) {
        throw new Error(`Unsupported export format: ${config.format}`);
      }

      // Verify channel exists and get info
      const channelInfo = await this.channelService.getChannelInfo(
        config.channelId as Snowflake
      );
      if (!channelInfo) {
        throw new Error(`Channel ${config.channelId} not found or inaccessible`);
      }

      console.log(`Starting export of channel: ${this.channelService.formatChannelName(channelInfo.channel)}`);

      // Create progress tracking
      let totalProcessed = 0;
      let filteredCount = 0;

      // Collect all messages with filtering
      const allMessages: import("../types/discord.js").Message[] = [];

      for await (const batch of this.messageService.fetchMessagesPaginated(
        config.channelId as Snowflake,
        config,
        (progress) => {
          // Update internal tracking
          totalProcessed = progress.messageCount;

          // Call external progress handler
          if (onProgress) {
            onProgress(progress);
          }
        }
      )) {
        allMessages.push(...batch);
      }

      // Apply final filtering if date range is specified
      let finalMessages = allMessages;
      if (config.dateRange) {
        const beforeCount = finalMessages.length;
        finalMessages = allMessages.filter(msg => {
          const msgDate = new Date(msg.timestamp);
          return msgDate >= config.dateRange!.from && msgDate <= config.dateRange!.to;
        });
        filteredCount += beforeCount - finalMessages.length;
      }

      // Sort messages chronologically
      finalMessages.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      console.log(`Collected ${finalMessages.length} messages${filteredCount > 0 ? ` (filtered out ${filteredCount})` : ""}`);

      // Export using appropriate format
      const result = await exporter.export(finalMessages, config.outputPath);

      console.log(`Export completed: ${result.file} (${this.formatFileSize(result.size)})`);

      return {
        ...result,
        duration: Date.now() - startTime,
        filtered: filteredCount,
      };
    } catch (error) {
      console.error(`Export failed for channel ${config.channelId}:`, error);
      throw error;
    }
  }

  // Export multiple channels
  async exportMultipleChannels(
    configs: ExportConfig[],
    onProgress?: (channelIndex: number, totalChannels: number, progress: ExportProgress) => void
  ): Promise<ExportResult[]> {
    const results: ExportResult[] = [];

    for (let i = 0; i < configs.length; i++) {
      const config = configs[i];
      console.log(`Exporting channel ${i + 1}/${configs.length}: ${config.channelId}`);

      try {
        const result = await this.exportChannel(config, (progress) => {
          if (onProgress) {
            onProgress(i, configs.length, progress);
          }
        });
        results.push(result);
      } catch (error) {
        console.error(`Failed to export channel ${config.channelId}:`, error);
        // Continue with other channels
        results.push({
          messageCount: 0,
          attachmentCount: 0,
          embedCount: 0,
          startDate: null,
          endDate: null,
          file: config.outputPath,
          size: 0,
          duration: 0,
          filtered: 0,
          skipped: 0,
        });
      }
    }

    return results;
  }

  // Get export statistics without actually exporting
  async getExportPreview(channelId: string, config: Partial<ExportConfig> = {}): Promise<{
    messageCount: number;
    dateRange: { first: Date | null; last: Date | null };
    stats: ReturnType<typeof import("../services/message-service.js").MessageService.prototype.getMessageStats>;
  }> {
    // Create a temporary config for preview
    const tempConfig: Partial<ExportConfig> = {
      ...config,
      limit: 100, // Only fetch first 100 messages for preview
    };

    const previewMessages = await this.messageService.fetchAllMessages(
      channelId as Snowflake,
      tempConfig
    );

    const stats = this.messageService.getMessageStats(previewMessages);
    const dateRange = {
      first: stats.dateRange?.first || null,
      last: stats.dateRange?.last || null,
    };

    // Estimate total message count (multiply by batches)
    const estimatedTotal = previewMessages.length === 100
      ? null // Unknown if we hit the limit
      : previewMessages.length;

    return {
      messageCount: estimatedTotal ?? previewMessages.length,
      dateRange,
      stats,
    };
  }

  // Validate export configuration
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

  // Format file size for display
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

  // Register a new exporter
  registerExporter(format: string, exporter: MessageExporter): void {
    this.exporters.set(format, exporter);
  }

  // Get supported export formats
  getSupportedFormats(): string[] {
    return Array.from(this.exporters.keys());
  }

  // Create export config from CLI arguments
  createExportConfig(args: {
    channel: string;
    output: string;
    format?: string;
    batchSize?: number;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
  }): ExportConfig {
    const config: ExportConfig = {
      channelId: args.channel,
      outputPath: args.output,
      format: (args.format as any) || "json",
      batchSize: args.batchSize || 100,
      includeAttachments: true,
      includeEmbeds: true,
      sortBy: "oldest",
    };

    if (args.limit) {
      config.limit = args.limit;
    }

    if (args.dateFrom || args.dateTo) {
      const from = args.dateFrom ? new Date(args.dateFrom) : new Date(0);
      const to = args.dateTo ? new Date(args.dateTo) : new Date();

      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        throw new Error("Invalid date format. Use ISO 8601 format (YYYY-MM-DD)");
      }

      config.dateRange = { from, to };
    }

    return config;
  }
}
// JSON exporter implementation

import { writeFile } from "node:fs/promises";
import type { Message } from "../types/discord.js";
import type { ExportResult } from "../types/export.js";
import { BaseMessageExporter } from "./base.js";

// JSON export format with metadata
interface JsonExportData {
  meta: {
    exportedAt: string;
    exportedBy: string;
    version: string;
    messageCount: number;
    dateRange: {
      first: string;
      last: string;
    } | null;
    channel: {
      id: string;
      type: number;
      name: string | null;
    };
    stats: {
      uniqueAuthors: number;
      attachmentCount: number;
      embedCount: number;
      reactionCount: number;
    };
  };
  messages: Message[];
}

// Export messages to JSON format
export class JsonExporter extends BaseMessageExporter {
  async export(messages: Message[], outputPath: string): Promise<ExportResult> {
    const startTime = Date.now();
    const finalPath = this.ensureExtension(outputPath);

    // Sort messages chronologically
    const sortedMessages = [...messages].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Get channel info from first message
    const channelInfo = messages.length > 0
      ? {
          id: messages[0].channelId,
          type: 0, // Would need channel service to get actual type
          name: null, // Would need channel service to get actual name
        }
      : { id: "", type: 0, name: null };

    // Calculate date range
    const timestamps = sortedMessages
      .map(m => new Date(m.timestamp))
      .filter(d => !isNaN(d.getTime()));

    const dateRange = timestamps.length > 0
      ? {
          first: timestamps[0].toISOString(),
          last: timestamps[timestamps.length - 1].toISOString(),
        }
      : null;

    // Calculate statistics
    const stats = this.calculateStats(sortedMessages);

    // Create export data structure
    const exportData: JsonExportData = {
      meta: {
        exportedAt: new Date().toISOString(),
        exportedBy: "Gurt Discord Chat Exporter",
        version: "1.0.0",
        messageCount: sortedMessages.length,
        dateRange,
        channel: channelInfo,
        stats: {
          uniqueAuthors: stats.uniqueAuthors,
          attachmentCount: stats.attachments.count,
          embedCount: stats.embeds.count,
          reactionCount: stats.reactions.count,
        },
      },
      messages: sortedMessages,
    };

    // Write to file
    const jsonString = JSON.stringify(exportData, null, 2);
    await writeFile(finalPath, jsonString, "utf8");

    const duration = Date.now() - startTime;
    const fileSize = Buffer.byteLength(jsonString, "utf8");

    return this.createResult(sortedMessages, finalPath, fileSize, duration);
  }

  getExtension(): string {
    return "json";
  }

  getMimeType(): string {
    return "application/json";
  }

  // Export in streaming fashion for very large exports
  async exportStream(
    messages: AsyncIterable<Message[]>,
    outputPath: string
  ): Promise<ExportResult> {
    const startTime = Date.now();
    const finalPath = this.ensureExtension(outputPath);

    // For now, collect all messages first
    // In a full implementation, we could stream to file
    const allMessages: Message[] = [];
    let totalMessages = 0;

    for await (const batch of messages) {
      allMessages.push(...batch);
      totalMessages += batch.length;
    }

    return this.export(allMessages, finalPath);
  }

  // Export with custom formatting options
  async exportCustom(
    messages: Message[],
    outputPath: string,
    options: {
      includeMeta?: boolean;
      indent?: number | null;
      includeRaw?: boolean; // Include raw Discord object
    } = {}
  ): Promise<ExportResult> {
    const startTime = Date.now();
    const finalPath = this.ensureExtension(outputPath);
    const {
      includeMeta = true,
      indent = 2,
      includeRaw = false,
    } = options;

    // Sort messages
    const sortedMessages = [...messages].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Prepare export data
    let exportData: any;

    if (includeMeta) {
      exportData = {
        meta: {
          exportedAt: new Date().toISOString(),
          exportedBy: "Gurt Discord Chat Exporter",
          version: "1.0.0",
          messageCount: sortedMessages.length,
        },
        messages: sortedMessages,
      };
    } else {
      exportData = sortedMessages;
    }

    if (includeRaw) {
      // Add raw objects if requested
      if (Array.isArray(exportData)) {
        exportData = exportData.map(msg => ({ ...msg, raw: msg }));
      } else {
        exportData.messages = exportData.messages.map((msg: Message) => ({ ...msg, raw: msg }));
      }
    }

    // Write to file
    const jsonString = JSON.stringify(exportData, null, indent);
    await writeFile(finalPath, jsonString, "utf8");

    const duration = Date.now() - startTime;
    const fileSize = Buffer.byteLength(jsonString, "utf8");

    return this.createResult(sortedMessages, finalPath, fileSize, duration);
  }
}
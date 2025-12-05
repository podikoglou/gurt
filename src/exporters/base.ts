// Base exporter interface and common functionality

import type { Message } from "../types/discord.js";
import type { ExportResult, ExportStats } from "../types/export.js";

// Interface for message exporters
export interface MessageExporter {
  export(messages: Message[], outputPath: string): Promise<ExportResult>;
  getExtension(): string;
  getMimeType(): string;
}

// Base class with common functionality
export abstract class BaseMessageExporter implements MessageExporter {
  abstract export(messages: Message[], outputPath: string): Promise<ExportResult>;
  abstract getExtension(): string;
  abstract getMimeType(): string;

  // Calculate export statistics
  protected calculateStats(messages: Message[]): ExportStats {
    const uniqueAuthors = new Set(messages.map(m => m.author.id)).size;

    const attachments = messages.reduce((acc, m) => {
      acc.count += m.attachments.length;
      acc.totalSize += m.attachments.reduce((sum, att) => sum + att.size, 0);

      m.attachments.forEach(att => {
        const ext = att.filename.split('.').pop()?.toLowerCase() || 'unknown';
        acc.types[ext] = (acc.types[ext] || 0) + 1;
      });

      return acc;
    }, { count: 0, totalSize: 0, types: {} as Record<string, number> });

    const reactions = messages.reduce((acc, m) => {
      acc.count += m.reactions.length;
      m.reactions.forEach(r => {
        const emoji = r.emoji.name || r.emoji.id || 'unknown';
        acc.unique.add(emoji);
      });
      return acc;
    }, { count: 0, unique: new Set<string>() });

    const embeds = messages.reduce((acc, m) => {
      acc.count += m.embeds.length;
      m.embeds.forEach(embed => {
        const type = embed.title ? 'rich' : 'unknown';
        acc.types[type] = (acc.types[type] || 0) + 1;
      });
      return acc;
    }, { count: 0, types: {} as Record<string, number> });

    const timestamps = messages
      .map(m => new Date(m.timestamp))
      .filter(d => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    const dateRange = timestamps.length > 0
      ? { first: timestamps[0]!, last: timestamps[timestamps.length - 1]! }
      : { first: new Date(), last: new Date() };

    return {
      totalMessages: messages.length,
      uniqueAuthors,
      dateRange,
      attachments,
      reactions: {
        count: reactions.count,
        unique: reactions.unique.size,
      },
      embeds,
    };
  }

  // Create basic export result
  protected createResult(
    messages: Message[],
    outputPath: string,
    fileSize: number,
    duration: number,
    filtered = 0,
    skipped = 0
  ): ExportResult {
    const stats = this.calculateStats(messages);

    return {
      messageCount: messages.length,
      attachmentCount: stats.attachments.count,
      embedCount: stats.embeds.count,
      startDate: stats.dateRange.first,
      endDate: stats.dateRange.last,
      file: outputPath,
      size: fileSize,
      duration,
      filtered,
      skipped,
    };
  }

  // Ensure output path has correct extension
  protected ensureExtension(outputPath: string): string {
    const ext = this.getExtension();
    if (!outputPath.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) {
      return `${outputPath}.${ext}`;
    }
    return outputPath;
  }
}
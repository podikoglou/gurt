// Export-specific type definitions for the Discord chat exporter

import type { Message } from "./discord.js";

// Configuration for exporting messages
export interface ExportConfig {
  channelId: string;
  outputPath: string;
  format: ExportFormat;
  batchSize: number;
  dateRange?: {
    from: Date;
    to: Date;
  };
  includeAttachments: boolean;
  includeEmbeds: boolean;
  sortBy: "oldest" | "newest";
  filters?: MessageFilter[];
  // Optional: limit number of messages to export
  limit?: number;
}

// Supported export formats
export enum ExportFormat {
  JSON = "json",
  CSV = "csv",
  HTML = "html",
  MARKDOWN = "markdown",
  TXT = "txt",
}

// Message filter for selective export
export interface MessageFilter {
  type: "user" | "content" | "date" | "hasAttachments" | "hasEmbeds" | "authorId";
  value: string | RegExp | Date | boolean;
}

// Result of an export operation
export interface ExportResult {
  messageCount: number;
  attachmentCount: number;
  embedCount: number;
  startDate: Date | null;
  endDate: Date | null;
  file: string;
  size: number;
  duration: number; // Time taken in milliseconds
  filtered: number; // Number of messages filtered out
  skipped: number; // Number of messages skipped due to errors
}

// Progress information during export
export interface ExportProgress {
  messageCount: number;
  totalCount?: number; // Total if known
  percentage: number; // 0-100
  currentMessage?: Message;
  rate: number; // Messages per second
  eta?: number; // Estimated time remaining in seconds
}

// Statistics about exported data
export interface ExportStats {
  totalMessages: number;
  uniqueAuthors: number;
  dateRange: {
    first: Date;
    last: Date;
  };
  attachments: {
    count: number;
    totalSize: number;
    types: Record<string, number>;
  };
  reactions: {
    count: number;
    unique: number;
  };
  embeds: {
    count: number;
    types: Record<string, number>;
  };
}
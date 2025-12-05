// Export types - simplified for raw Discord responses

// Configuration for exporting messages
export interface ExportConfig {
  channelId: string;
  outputPath: string;
  format: string;
  batchSize: number;
  sortBy?: "oldest" | "newest";
  limit?: number;
  dateRange?: {
    from: Date;
    to: Date;
  };
  filters?: any[];
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
  currentMessage?: any;
  rate: number; // Messages per second
  eta?: number; // Estimated time remaining in seconds
}
/**
 * Configuration for message export operations
 */
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

/**
 * Summary of completed export operation
 */
export interface ExportResult {
  messageCount: number;
  attachmentCount: number;
  embedCount: number;
  startDate: Date | null;
  endDate: Date | null;
  file: string;
  size: number;
  duration: number;
  filtered: number;
  skipped: number;
}

/**
 * Real-time export progress information
 */
export interface ExportProgress {
  messageCount: number;
  totalCount?: number;
  percentage: number;
  currentMessage?: any;
  rate: number;
  eta?: number;
}
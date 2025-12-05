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
  /** Whether to use streaming mode (write after each batch) or buffered mode (write at end) */
  streaming?: boolean;
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

/**
 * Options passed to an exporter during initialization
 */
export interface ExporterOptions {
  /**
   * Whether to use streaming mode (write after each batch)
   * or buffered mode (accumulate in memory, write at end)
   *
   * Streaming mode is better for resumability and memory efficiency
   * Buffered mode may be faster for small exports
   */
  streaming: boolean;
}

/**
 * Metadata about the export, written alongside messages
 */
export interface ExportMetadata {
  exportedAt: string;
  messageCount: number;
}

/**
 * Unified interface for all exporters
 *
 * Exporters follow a lifecycle pattern:
 * 1. open() - Initialize the export, create/open the output file
 * 2. write() - Called for each batch of messages (may be called multiple times)
 * 3. close() - Finalize the export, write any remaining data, return result
 *
 * For streaming exporters, write() persists data immediately.
 * For buffered exporters, write() accumulates data and close() does the final write.
 */
export interface Exporter {
  /**
   * Initialize the exporter and prepare the output file
   * @param outputPath - Path where the export file should be created
   * @param options - Exporter configuration options
   */
  open(outputPath: string, options: ExporterOptions): Promise<void>;

  /**
   * Write a batch of messages to the export
   * In streaming mode: persists to disk immediately
   * In buffered mode: accumulates in memory
   * @param messages - Array of raw Discord API message objects
   */
  write(messages: unknown[]): Promise<void>;

  /**
   * Finalize the export and return the result
   * Closes any open file handles and writes final metadata
   */
  close(): Promise<ExportResult>;

  /** Get the file extension for this format (e.g., "json", "jsonl", "csv") */
  getExtension(): string;

  /** Get the MIME type for this format */
  getMimeType(): string;
}

/**
 * Factory function type for creating exporter instances
 */
export type ExporterFactory = () => Exporter;

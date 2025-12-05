import type {
  Exporter,
  ExporterOptions,
  ExportResult,
  ResumeInfo,
} from "../types/export.js";
import { getFileSize } from "../utils/fs.js";

/**
 * Abstract base class for exporters
 *
 * Provides common functionality and state management for all exporters.
 * Subclasses implement the specific serialization logic.
 */
export abstract class BaseExporter implements Exporter {
  protected outputPath: string = "";
  protected streaming: boolean = true;
  protected messages: unknown[] = [];
  protected startTime: number = 0;

  async open(outputPath: string, options: ExporterOptions): Promise<void> {
    this.outputPath = outputPath;
    this.streaming = options.streaming;
    this.messages = [];
    this.startTime = Date.now();

    await this.onOpen();
  }

  async openForResume(
    outputPath: string,
    resumeInfo: ResumeInfo,
    options: ExporterOptions
  ): Promise<void> {
    this.outputPath = outputPath;
    this.streaming = options.streaming;
    this.startTime = Date.now();

    // Let subclass handle format-specific resume initialization
    await this.onOpenForResume(resumeInfo);
  }

  async write(messages: unknown[]): Promise<void> {
    this.messages.push(...messages);

    if (this.streaming) {
      await this.persist();
    }
  }

  async close(): Promise<ExportResult> {
    await this.persist();

    const size = await this.calculateFileSize();
    const duration = Date.now() - this.startTime;

    return {
      messageCount: this.messages.length,
      attachmentCount: 0,
      embedCount: 0,
      startDate: null,
      endDate: null,
      file: this.outputPath,
      size,
      duration,
      filtered: 0,
      skipped: 0,
    };
  }

  abstract getExtension(): string;
  abstract getMimeType(): string;

  /**
   * Parse an existing export file to extract resume information.
   * Must be implemented by subclasses.
   * @throws Error if the file cannot be parsed or contains no messages
   */
  abstract parseResumeInfo(filePath: string): Promise<ResumeInfo>;

  /**
   * Called after open() has initialized base state.
   * Override to perform format-specific initialization.
   */
  protected async onOpen(): Promise<void> {
    // Default: no-op, subclasses can override
  }

  /**
   * Called after openForResume() has initialized base state.
   * Override to perform format-specific resume initialization.
   */
  protected async onOpenForResume(resumeInfo: ResumeInfo): Promise<void> {
    // Default: no-op, subclasses must override
    throw new Error("Resume not implemented for this exporter");
  }

  /**
   * Persist current messages to disk.
   * Must be implemented by subclasses.
   */
  protected abstract persist(): Promise<void>;

  /**
   * Calculate the size of the output file in bytes.
   */
  protected async calculateFileSize(): Promise<number> {
    return getFileSize(this.outputPath);
  }
}

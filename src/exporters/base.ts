import type {
  Exporter,
  ExporterOptions,
  ExportResult,
} from "../types/export.js";

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
    this.outputPath = this.normalizeOutputPath(outputPath);
    this.streaming = options.streaming;
    this.messages = [];
    this.startTime = Date.now();

    await this.onOpen();
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
   * Called after open() has initialized base state.
   * Override to perform format-specific initialization.
   */
  protected async onOpen(): Promise<void> {
    // Default: no-op, subclasses can override
  }

  /**
   * Persist current messages to disk.
   * Must be implemented by subclasses.
   */
  protected abstract persist(): Promise<void>;

  /**
   * Normalize the output path to include the correct extension.
   */
  protected normalizeOutputPath(outputPath: string): string {
    const ext = `.${this.getExtension()}`;
    return outputPath.toLowerCase().endsWith(ext) ? outputPath : `${outputPath}${ext}`;
  }

  /**
   * Calculate the size of the output file in bytes.
   */
  protected async calculateFileSize(): Promise<number> {
    try {
      const file = Bun.file(this.outputPath);
      return file.size;
    } catch {
      return 0;
    }
  }
}

import { BaseExporter } from "./base.js";

/**
 * JSON exporter that saves raw Discord API responses
 *
 * Supports two modes:
 * - Streaming: Rewrites the entire JSON file after each batch (for resumability)
 * - Buffered: Accumulates messages in memory and writes once at the end
 *
 * Note: JSON format requires rewriting the entire file on each update since
 * JSON doesn't support appending. For append-friendly exports, use JSONL.
 */
export class JsonExporter extends BaseExporter {
  getExtension(): string {
    return "json";
  }

  getMimeType(): string {
    return "application/json";
  }

  protected override async onOpen(): Promise<void> {
    // In streaming mode, initialize the file with empty structure
    if (this.streaming) {
      await this.persist();
    }
  }

  protected async persist(): Promise<void> {
    const exportData = {
      exportedAt: new Date().toISOString(),
      messageCount: this.messages.length,
      messages: this.messages,
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    await Bun.write(this.outputPath, jsonString);
  }
}

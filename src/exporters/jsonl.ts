import { BaseExporter } from "./base.js";

/**
 * JSONL (JSON Lines) exporter that saves messages one per line
 *
 * JSONL is ideal for streaming exports because:
 * - Each line is a valid JSON object (one message per line)
 * - New messages can be appended without rewriting the file
 * - Easy to parse incrementally and resume from failures
 *
 * Format: Each line contains a single message as a JSON object.
 * The first line contains export metadata.
 */
export class JsonlExporter extends BaseExporter {
  private lastWrittenIndex: number = 0;

  getExtension(): string {
    return "jsonl";
  }

  getMimeType(): string {
    return "application/x-ndjson";
  }

  protected override async onOpen(): Promise<void> {
    this.lastWrittenIndex = 0;

    // Write metadata header line
    if (this.streaming) {
      await this.writeMetadataLine();
    }
  }

  protected async persist(): Promise<void> {
    if (this.streaming) {
      // Append only new messages since last write
      await this.appendNewMessages();
    } else {
      // Buffered mode: write everything at once
      await this.writeAll();
    }
  }

  /**
   * Write the metadata header line
   */
  private async writeMetadataLine(): Promise<void> {
    const metadata = {
      _type: "metadata",
      exportedAt: new Date().toISOString(),
      format: "jsonl",
      version: 1,
    };

    await Bun.write(this.outputPath, JSON.stringify(metadata) + "\n");
  }

  /**
   * Append only messages that haven't been written yet
   */
  private async appendNewMessages(): Promise<void> {
    if (this.lastWrittenIndex >= this.messages.length) {
      return; // Nothing new to write
    }

    const newMessages = this.messages.slice(this.lastWrittenIndex);
    const lines = newMessages.map((msg) => JSON.stringify(msg)).join("\n");

    const file = Bun.file(this.outputPath);
    const existing = await file.text();
    await Bun.write(this.outputPath, existing + lines + "\n");

    this.lastWrittenIndex = this.messages.length;
  }

  /**
   * Write all messages at once (buffered mode)
   */
  private async writeAll(): Promise<void> {
    const metadata = {
      _type: "metadata",
      exportedAt: new Date().toISOString(),
      format: "jsonl",
      version: 1,
      messageCount: this.messages.length,
    };

    const lines = [
      JSON.stringify(metadata),
      ...this.messages.map((msg) => JSON.stringify(msg)),
    ].join("\n");

    await Bun.write(this.outputPath, lines + "\n");
  }
}

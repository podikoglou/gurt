import { BaseExporter } from "./base.js";
import type { ResumeInfo } from "../types/export.js";
import { appendFile, countLines, fileExists, readHead, readTail, writeFile } from "../utils/fs.js";

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

    await writeFile(this.outputPath, JSON.stringify(metadata) + "\n");
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

    await appendFile(this.outputPath, lines + "\n");

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

    await writeFile(this.outputPath, lines + "\n");
  }

  async parseResumeInfo(filePath: string): Promise<ResumeInfo> {
    if (!(await fileExists(filePath))) {
      throw new Error(`Export file not found: ${filePath}`);
    }

    const head = await readHead(filePath, 65536);
    const headLines = head.trim().split("\n").filter((line) => line.length > 0);

    if (headLines.length === 0) {
      throw new Error("Export file is empty");
    }

    // First line should be metadata
    let hasMetadata = false;
    try {
      const firstLine = JSON.parse(headLines[0]!);
      hasMetadata = firstLine._type === "metadata";
    } catch {
      // First line isn't valid JSON or isn't metadata
    }

    const firstMsgLine = hasMetadata ? headLines[1] : headLines[0];
    if (!firstMsgLine) {
      throw new Error("Export file contains no messages to resume from");
    }

    let firstMessage: { channel_id?: string };
    try {
      firstMessage = JSON.parse(firstMsgLine);
    } catch (e) {
      throw new Error(`Failed to parse first message line: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!firstMessage.channel_id || typeof firstMessage.channel_id !== "string") {
      throw new Error("Invalid message format: missing 'channel_id' field");
    }

    // Parse the last message line to get the oldest message ID from tail
    // (messages are in reverse chronological order - newest first)
    const tail = await readTail(filePath, 65536);
    const tailLines = tail.trim().split("\n").filter((line) => line.length > 0);

    if (tailLines.length === 0) {
      throw new Error("Export file contains no messages to resume from");
    }

    const lastLine = tailLines[tailLines.length - 1]!;
    let lastMessage: { id?: string };

    try {
      lastMessage = JSON.parse(lastLine);
    } catch (e) {
      throw new Error(`Failed to parse last message line: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!lastMessage.id || typeof lastMessage.id !== "string") {
      throw new Error("Invalid message format: missing 'id' field");
    }

    const totalLines = await countLines(filePath);
    const messageCount = hasMetadata ? Math.max(0, totalLines - 1) : totalLines;

    return {
      lastMessageId: lastMessage.id,
      existingMessageCount: messageCount,
      channelId: firstMessage.channel_id,
    };
  }

  protected override async onOpenForResume(resumeInfo: ResumeInfo): Promise<void> {
    // For JSONL, we just need to set the index so we don't try to rewrite existing content
    // The existing file already has the metadata header and previous messages
    // We'll append new messages directly

    // Set lastWrittenIndex to match the "virtual" count of existing messages
    // Since we're not loading them into this.messages, we track separately
    this.lastWrittenIndex = 0;
    this.messages = [];

    // We don't need to write anything - the file already exists with data
  }
}

import { BaseExporter } from "./base.js";
import type { ResumeInfo } from "../types/export.js";

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

  async parseResumeInfo(filePath: string): Promise<ResumeInfo> {
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      throw new Error(`Export file not found: ${filePath}`);
    }

    const text = await file.text();

    let data: { messages?: unknown[]; messageCount?: number };
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`Failed to parse JSON export file: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!data.messages || !Array.isArray(data.messages)) {
      throw new Error("Invalid JSON export: missing or invalid 'messages' array");
    }

    if (data.messages.length === 0) {
      throw new Error("Export file contains no messages to resume from");
    }

    // Messages are in reverse chronological order (newest first)
    // The last message is the oldest one - we need to fetch BEFORE it
    const oldestMessage = data.messages[data.messages.length - 1] as { id?: string };

    if (!oldestMessage.id || typeof oldestMessage.id !== "string") {
      throw new Error("Invalid message format: missing 'id' field");
    }

    // Get channel ID from the first message
    const firstMessage = data.messages[0] as { channel_id?: string };
    if (!firstMessage.channel_id || typeof firstMessage.channel_id !== "string") {
      throw new Error("Invalid message format: missing 'channel_id' field");
    }

    return {
      lastMessageId: oldestMessage.id,
      existingMessageCount: data.messages.length,
      channelId: firstMessage.channel_id,
      existingMessages: data.messages,
    };
  }

  protected override async onOpenForResume(resumeInfo: ResumeInfo): Promise<void> {
    // Load existing messages into memory - JSON needs to rewrite the entire file
    this.messages = resumeInfo.existingMessages ? [...resumeInfo.existingMessages] : [];

    // In streaming mode, we don't need to write yet since we haven't added new messages
    // The first write() call will trigger persist() with old + new messages
  }
}

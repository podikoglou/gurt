import { BaseExporter } from "./base.js";
import type { ExportResult, ResumeInfo } from "../types/export.js";
import { fileExists, readHead, readTail, writeFile } from "../utils/fs.js";

/**
 * JSON exporter that saves raw Discord API responses
 *
 * Supports two modes:
 * - Streaming: Writes messages incrementally (append-based when resuming)
 * - Buffered: Accumulates messages in memory and writes once at the end
 */
export class JsonExporter extends BaseExporter {
  private resumeHandle: import("node:fs/promises").FileHandle | null = null;
  private resumeOffset: number = 0;
  private resumeMessageCount: number = 0;

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
    await writeFile(this.outputPath, jsonString);
  }

  async parseResumeInfo(filePath: string): Promise<ResumeInfo> {
    if (!(await fileExists(filePath))) {
      throw new Error(`Export file not found: ${filePath}`);
    }

    const head = await readHead(filePath, 65536);
    if (!head.trim()) {
      throw new Error("Export file is empty");
    }

    const firstMessage = this.extractFirstMessage(head);
    if (!firstMessage) {
      throw new Error("Invalid JSON export: missing or invalid 'messages' array");
    }

    if (!firstMessage.channel_id || typeof firstMessage.channel_id !== "string") {
      throw new Error("Invalid message format: missing 'channel_id' field");
    }

    // Read tail to extract the last (oldest) message
    let tail = await readTail(filePath, 65536);
    let oldestMessage = this.extractLastMessage(tail);

    // If 64KB wasn't enough (e.g. large embeds/attachments), try reading up to 512KB from the tail
    if (!oldestMessage) {
      tail = await readTail(filePath, 524288);
      oldestMessage = this.extractLastMessage(tail);
    }

    if (!oldestMessage) {
      throw new Error("Export file contains no messages to resume from");
    }

    if (!oldestMessage.id || typeof oldestMessage.id !== "string") {
      throw new Error("Invalid message format: missing 'id' field");
    }

    const countMatch = head.match(/"messageCount"\s*:\s*(\d+)/);
    const existingMessageCount = countMatch ? parseInt(countMatch[1]!, 10) : 1;

    return {
      lastMessageId: oldestMessage.id,
      existingMessageCount,
      channelId: firstMessage.channel_id,
    };
  }

  private extractFirstMessage(head: string): Record<string, unknown> | null {
    const messagesIdx = head.indexOf('"messages"');
    if (messagesIdx === -1) return null;
    const bracketIdx = head.indexOf("[", messagesIdx);
    if (bracketIdx === -1) return null;
    const start = head.indexOf("{", bracketIdx);
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    for (let i = start; i < head.length; i++) {
      const char = head[i];
      if (inString) {
        if (char === '"' && head[i - 1] !== "\\") {
          inString = false;
        }
      } else {
        if (char === '"') {
          inString = true;
        } else if (char === "{") {
          depth++;
        } else if (char === "}") {
          depth--;
          if (depth === 0) {
            try {
              return JSON.parse(head.slice(start, i + 1));
            } catch {
              return null;
            }
          }
        }
      }
    }
    return null;
  }

  private extractLastMessage(tail: string): Record<string, unknown> | null {
    const bracketIndex = tail.lastIndexOf("]");
    const end = bracketIndex !== -1 ? tail.lastIndexOf("}", bracketIndex) : tail.lastIndexOf("}");
    if (end === -1) return null;

    let depth = 0;
    let inString = false;

    for (let i = end; i >= 0; i--) {
      const char = tail[i];
      if (inString) {
        if (char === '"' && tail[i - 1] !== "\\") {
          inString = false;
        }
      } else {
        if (char === '"') {
          inString = true;
        } else if (char === "}") {
          depth++;
        } else if (char === "{") {
          depth--;
          if (depth === 0) {
            try {
              return JSON.parse(tail.slice(i, end + 1));
            } catch {
              return null;
            }
          }
        }
      }
    }
    return null;
  }

  protected override async onOpenForResume(resumeInfo: ResumeInfo): Promise<void> {
    const fs = await import("node:fs/promises");
    const handle = await fs.open(this.outputPath, "r+");
    const stat = await handle.stat();

    const tailLen = Math.min(65536, stat.size);
    const buf = Buffer.alloc(tailLen);
    await handle.read(buf, 0, tailLen, Math.max(0, stat.size - tailLen));
    const tailStr = buf.toString("utf-8");

    let truncateOffset: number;
    const bracketPos = tailStr.lastIndexOf("]");
    if (bracketPos !== -1) {
      truncateOffset = Math.max(0, stat.size - tailLen) + bracketPos;
    } else {
      const bracePos = tailStr.lastIndexOf("}");
      if (bracePos === -1) {
        await handle.close();
        throw new Error("Unable to find message boundary to resume JSON export");
      }
      truncateOffset = Math.max(0, stat.size - tailLen) + bracePos + 1;
    }

    await handle.truncate(truncateOffset);
    this.resumeHandle = handle;
    this.resumeOffset = truncateOffset;
    this.resumeMessageCount = resumeInfo.existingMessageCount;
    this.messages = [];
  }

  override async write(messages: unknown[]): Promise<void> {
    if (this.resumeHandle) {
      if (messages.length === 0) return;

      let chunk = "";
      for (const msg of messages) {
        chunk += ",\n    " + JSON.stringify(msg, null, 2).replace(/\n/g, "\n    ");
      }
      await this.resumeHandle.write(chunk, this.resumeOffset);
      this.resumeOffset += Buffer.byteLength(chunk);
      this.resumeMessageCount += messages.length;

      // Temporarily write closing brackets so the file remains valid JSON if interrupted
      await this.resumeHandle.write("\n  ]\n}\n", this.resumeOffset);
    } else {
      await super.write(messages);
    }
  }

  override async close(): Promise<ExportResult> {
    if (this.resumeHandle) {
      // Ensure final closing brackets are written
      await this.resumeHandle.write("\n  ]\n}\n", this.resumeOffset);
      await this.resumeHandle.close();
      this.resumeHandle = null;

      const size = await this.calculateFileSize();
      const duration = Date.now() - this.startTime;

      return {
        messageCount: this.resumeMessageCount,
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

    return super.close();
  }
}

import { BaseExporter } from "./base.js";
import type { ResumeInfo } from "../types/export.js";

/**
 * CSV exporter that saves messages in a tabular format
 *
 * CSV is useful for:
 * - Importing into spreadsheets (Excel, Google Sheets)
 * - Data analysis tools
 * - Human-readable tabular view
 *
 * Nested fields (author, attachments, embeds) are flattened.
 * Complex data is either counted or JSON-serialized.
 */
export class CsvExporter extends BaseExporter {
  private lastWrittenIndex: number = 0;

  private static readonly COLUMNS = [
    "id",
    "timestamp",
    "edited_timestamp",
    "author_id",
    "author_username",
    "author_discriminator",
    "author_bot",
    "content",
    "type",
    "channel_id",
    "attachments_count",
    "attachments",
    "embeds_count",
    "embeds",
    "reactions_count",
    "reactions",
    "referenced_message_id",
    "pinned",
    "tts",
  ] as const;

  getExtension(): string {
    return "csv";
  }

  getMimeType(): string {
    return "text/csv";
  }

  protected override async onOpen(): Promise<void> {
    this.lastWrittenIndex = 0;

    // Write header row
    if (this.streaming) {
      await this.writeHeader();
    }
  }

  protected async persist(): Promise<void> {
    if (this.streaming) {
      await this.appendNewRows();
    } else {
      await this.writeAll();
    }
  }

  /**
   * Write the CSV header row
   */
  private async writeHeader(): Promise<void> {
    const header = CsvExporter.COLUMNS.join(",") + "\n";
    await Bun.write(this.outputPath, header);
  }

  /**
   * Append only messages that haven't been written yet
   */
  private async appendNewRows(): Promise<void> {
    if (this.lastWrittenIndex >= this.messages.length) {
      return;
    }

    const newMessages = this.messages.slice(this.lastWrittenIndex);
    const rows = newMessages.map((msg) => this.messageToRow(msg)).join("\n");

    const file = Bun.file(this.outputPath);
    const existing = await file.text();
    // Ensure we don't double up newlines when appending
    const separator = existing.endsWith("\n") ? "" : "\n";
    await Bun.write(this.outputPath, existing + separator + rows + "\n");

    this.lastWrittenIndex = this.messages.length;
  }

  /**
   * Write all messages at once (buffered mode)
   */
  private async writeAll(): Promise<void> {
    const header = CsvExporter.COLUMNS.join(",");
    const rows = this.messages.map((msg) => this.messageToRow(msg));
    const content = [header, ...rows].join("\n") + "\n";

    await Bun.write(this.outputPath, content);
  }

  /**
   * Convert a message object to a CSV row
   */
  private messageToRow(msg: unknown): string {
    const m = msg as Record<string, unknown>;
    const author = (m.author as Record<string, unknown>) || {};
    const attachments = (m.attachments as unknown[]) || [];
    const embeds = (m.embeds as unknown[]) || [];
    const reactions = (m.reactions as unknown[]) || [];
    const referencedMessage = m.referenced_message as Record<string, unknown> | null;

    const values: string[] = [
      this.escapeValue(m.id),
      this.escapeValue(m.timestamp),
      this.escapeValue(m.edited_timestamp),
      this.escapeValue(author.id),
      this.escapeValue(author.username),
      this.escapeValue(author.discriminator),
      this.escapeValue(author.bot),
      this.escapeValue(m.content),
      this.escapeValue(m.type),
      this.escapeValue(m.channel_id),
      this.escapeValue(attachments.length),
      this.escapeValue(attachments.length > 0 ? JSON.stringify(attachments) : ""),
      this.escapeValue(embeds.length),
      this.escapeValue(embeds.length > 0 ? JSON.stringify(embeds) : ""),
      this.escapeValue(reactions.length),
      this.escapeValue(reactions.length > 0 ? JSON.stringify(reactions) : ""),
      this.escapeValue(referencedMessage?.id),
      this.escapeValue(m.pinned),
      this.escapeValue(m.tts),
    ];

    return values.join(",");
  }

  /**
   * Escape a value for CSV format
   * - Wrap in quotes if contains comma, newline, or quote
   * - Escape quotes by doubling them
   */
  private escapeValue(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }

    const str = String(value);

    // Check if escaping is needed
    if (str.includes(",") || str.includes("\n") || str.includes("\r") || str.includes('"')) {
      // Escape quotes by doubling them and wrap in quotes
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }

  async parseResumeInfo(filePath: string): Promise<ResumeInfo> {
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      throw new Error(`Export file not found: ${filePath}`);
    }

    const text = await file.text();
    const rows = this.parseCSVFile(text);

    if (rows.length === 0) {
      throw new Error("Export file is empty");
    }

    // First row should be the header
    const columns = rows[0]!;

    const idIndex = columns.indexOf("id");
    if (idIndex === -1) {
      throw new Error("Invalid CSV export: missing 'id' column in header");
    }

    const dataRows = rows.slice(1);

    if (dataRows.length === 0) {
      throw new Error("Export file contains no messages to resume from");
    }

    // Parse the last row to get the oldest message ID
    // (messages are in reverse chronological order - newest first)
    const lastRow = dataRows[dataRows.length - 1]!;
    const lastMessageId = lastRow[idIndex];

    if (!lastMessageId) {
      throw new Error("Invalid CSV row: missing 'id' value");
    }

    // Get channel_id from the first data row
    const channelIdIndex = columns.indexOf("channel_id");
    if (channelIdIndex === -1) {
      throw new Error("Invalid CSV export: missing 'channel_id' column in header");
    }

    const firstRow = dataRows[0]!;
    const channelId = firstRow[channelIdIndex];

    if (!channelId) {
      throw new Error("Invalid CSV row: missing 'channel_id' value");
    }

    return {
      lastMessageId,
      existingMessageCount: dataRows.length,
      channelId,
      // CSV doesn't need to load all messages - we'll append to the file
    };
  }

  /**
   * Parse an entire CSV file, properly handling quoted fields with newlines
   */
  private parseCSVFile(text: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentValue = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          // Escaped quote
          currentValue += '"';
          i++; // Skip the next quote
        } else if (char === '"') {
          // End of quoted value
          inQuotes = false;
        } else {
          currentValue += char;
        }
      } else {
        if (char === '"') {
          // Start of quoted value
          inQuotes = true;
        } else if (char === ",") {
          // End of value
          currentRow.push(currentValue);
          currentValue = "";
        } else if (char === "\n" || (char === "\r" && nextChar === "\n")) {
          // End of row
          if (char === "\r") {
            i++; // Skip the \n in \r\n
          }
          currentRow.push(currentValue);
          if (currentRow.some((v) => v.length > 0)) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentValue = "";
        } else if (char !== "\r") {
          currentValue += char;
        }
      }
    }

    // Don't forget the last value/row
    if (currentValue.length > 0 || currentRow.length > 0) {
      currentRow.push(currentValue);
      if (currentRow.some((v) => v.length > 0)) {
        rows.push(currentRow);
      }
    }

    return rows;
  }

  /**
   * Parse a CSV row, handling quoted values
   */
  private parseCSVRow(row: string): string[] {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      const nextChar = row[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip the next quote
        } else if (char === '"') {
          // End of quoted value
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          // Start of quoted value
          inQuotes = true;
        } else if (char === ",") {
          // End of value
          values.push(current);
          current = "";
        } else {
          current += char;
        }
      }
    }

    // Don't forget the last value
    values.push(current);

    return values;
  }

  protected override async onOpenForResume(resumeInfo: ResumeInfo): Promise<void> {
    // For CSV, we just need to set the index so we don't try to rewrite existing content
    // The existing file already has the header and previous messages
    // We'll append new messages directly

    // Set lastWrittenIndex to match the "virtual" count of existing messages
    // Since we're not loading them into this.messages, we track separately
    this.lastWrittenIndex = 0;
    this.messages = [];

    // We don't need to write anything - the file already exists with data
  }
}

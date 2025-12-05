import { writeFile } from "node:fs/promises";
import type { ExportResult } from "../types/export.js";

/**
 * JSON exporter that saves raw Discord API responses
 *
 * Maintains complete fidelity to Discord's data structure
 * without parsing or transforming the content
 */
export class JsonExporter {
  async export(messages: unknown[], outputPath: string): Promise<ExportResult> {
    const startTime = Date.now();

    const finalPath = outputPath.toLowerCase().endsWith('.json')
      ? outputPath
      : `${outputPath}.json`;

    const exportData = {
      exportedAt: new Date().toISOString(),
      messageCount: messages.length,
      messages,
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    await writeFile(finalPath, jsonString, "utf-8");

    const duration = Date.now() - startTime;
    const size = Buffer.byteLength(jsonString, "utf-8");

    return {
      messageCount: messages.length,
      attachmentCount: 0,
      embedCount: 0,
      startDate: null,
      endDate: null,
      file: finalPath,
      size,
      duration,
      filtered: 0,
      skipped: 0,
    };
  }

  getExtension(): string {
    return "json";
  }

  getMimeType(): string {
    return "application/json";
  }
}
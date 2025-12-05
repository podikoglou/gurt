// JSON message exporter implementation - saves raw Discord responses

import { writeFile } from "node:fs/promises";
import type { ExportResult } from "../types/export.js";

// JSON exporter - just saves raw Discord responses
export class JsonExporter {
  async export(messages: unknown[], outputPath: string): Promise<ExportResult> {
    const startTime = Date.now();

    // Ensure .json extension
    const finalPath = outputPath.toLowerCase().endsWith('.json')
      ? outputPath
      : `${outputPath}.json`;

    // Create export with minimal metadata
    const exportData = {
      exportedAt: new Date().toISOString(),
      messageCount: messages.length,
      messages, // Raw Discord responses
    };

    // Write to file
    const jsonString = JSON.stringify(exportData, null, 2);
    await writeFile(finalPath, jsonString, "utf-8");

    const duration = Date.now() - startTime;
    const size = Buffer.byteLength(jsonString, "utf-8");

    return {
      messageCount: messages.length,
      attachmentCount: 0, // We don't parse raw responses
      embedCount: 0, // We don't parse raw responses
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
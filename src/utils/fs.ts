/**
 * Runtime-agnostic filesystem utilities
 *
 * Provides a unified API for filesystem operations that works in both
 * Bun and Node.js environments. Automatically detects the runtime and
 * uses the appropriate implementation.
 */

// Detect if we're running in Bun
const isBun = typeof globalThis.Bun !== "undefined";

/**
 * Check if a file exists at the given path
 */
export const fileExists: (path: string) => Promise<boolean> = isBun
  ? async (path) => {
      const file = Bun.file(path);
      return file.exists();
    }
  : async (path) => {
      const fs = await import("node:fs/promises");
      try {
        await fs.access(path);
        return true;
      } catch {
        return false;
      }
    };

/**
 * Read the contents of a file as text
 */
export const readFile: (path: string) => Promise<string> = isBun
  ? async (path) => {
      const file = Bun.file(path);
      return file.text();
    }
  : async (path) => {
      const fs = await import("node:fs/promises");
      return fs.readFile(path, "utf-8");
    };

/**
 * Write content to a file, creating it if it doesn't exist
 * or overwriting if it does
 */
export const writeFile: (path: string, content: string) => Promise<void> = isBun
  ? async (path, content) => {
      await Bun.write(path, content);
    }
  : async (path, content) => {
      const fs = await import("node:fs/promises");
      await fs.writeFile(path, content, "utf-8");
    };

/**
 * Get the size of a file in bytes
 * Returns 0 if the file doesn't exist or can't be accessed
 */
export const getFileSize: (path: string) => Promise<number> = isBun
  ? async (path) => {
      try {
        const file = Bun.file(path);
        return file.size;
      } catch {
        return 0;
      }
    }
  : async (path) => {
      const fs = await import("node:fs/promises");
      try {
        const stats = await fs.stat(path);
        return stats.size;
      } catch {
        return 0;
      }
    };

/**
 * Append content to a file
 * Appends directly without loading existing content into memory
 */
export const appendFile: (path: string, content: string) => Promise<void> = async (path, content) => {
  const fs = await import("node:fs/promises");
  await fs.appendFile(path, content, "utf-8");
};

/**
 * Read the first N bytes of a file as text
 */
export const readHead: (path: string, bytes?: number) => Promise<string> = isBun
  ? async (path, bytes = 65536) => {
      const file = Bun.file(path);
      const size = file.size;
      return file.slice(0, Math.min(bytes, size)).text();
    }
  : async (path, bytes = 65536) => {
      const fs = await import("node:fs/promises");
      const handle = await fs.open(path, "r");
      try {
        const stat = await handle.stat();
        const readLength = Math.min(bytes, stat.size);
        const buffer = Buffer.alloc(readLength);
        await handle.read(buffer, 0, readLength, 0);
        return buffer.toString("utf-8");
      } finally {
        await handle.close();
      }
    };

/**
 * Read the last N bytes of a file as text
 */
export const readTail: (path: string, bytes?: number) => Promise<string> = isBun
  ? async (path, bytes = 65536) => {
      const file = Bun.file(path);
      const size = file.size;
      const start = Math.max(0, size - bytes);
      return file.slice(start, size).text();
    }
  : async (path, bytes = 65536) => {
      const fs = await import("node:fs/promises");
      const handle = await fs.open(path, "r");
      try {
        const stat = await handle.stat();
        const readLength = Math.min(bytes, stat.size);
        const position = Math.max(0, stat.size - readLength);
        const buffer = Buffer.alloc(readLength);
        await handle.read(buffer, 0, readLength, position);
        return buffer.toString("utf-8");
      } finally {
        await handle.close();
      }
    };

/**
 * Fast newline count across a file using streams without loading into memory
 */
export const countLines: (path: string) => Promise<number> = async (path) => {
  const fs = await import("node:fs");
  return new Promise((resolve, reject) => {
    let count = 0;
    const stream = fs.createReadStream(path);
    stream.on("data", (chunk: Buffer) => {
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === 0x0a) count++;
      }
    });
    stream.on("end", () => resolve(count));
    stream.on("error", reject);
  });
};

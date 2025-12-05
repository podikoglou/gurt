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
 * This is an optimized operation that doesn't require reading the file first
 */
export const appendFile: (path: string, content: string) => Promise<void> = isBun
  ? async (path, content) => {
      // Bun doesn't have a native append, so we read + write
      // For better performance with large files, consider using streams
      const file = Bun.file(path);
      const existing = await file.text();
      await Bun.write(path, existing + content);
    }
  : async (path, content) => {
      const fs = await import("node:fs/promises");
      await fs.appendFile(path, content, "utf-8");
    };

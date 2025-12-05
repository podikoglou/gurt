import { choice, integer, string } from "@optique/core";
import { message } from "@optique/core/message";
import { RETRY } from "../utils/constants.js";
import {
  argument,
  command,
  constant,
  object,
  option,
  optional,
  or,
  withDefault,
  type InferValue,
} from "@optique/core/parser";
import { path } from "@optique/run";
import { DISCORD_API } from "../utils/constants.js";

// Query subcommands (nested under "query")

export const queryDmsCommand = command(
  "dm",
  object({
    queryType: constant("dm"),
  }),
  {
    brief: message`List all DM channels`,
  }
);

export const queryGuildsCommand = command(
  "guild",
  object({
    queryType: constant("guild"),
  }),
  {
    brief: message`List all guilds (servers)`,
  }
);

export const queryChannelsCommand = command(
  "channel",
  object({
    queryType: constant("channel"),
    guildId: argument(string({ metavar: "GUILD_ID" })),
  }),
  {
    brief: message`List text channels in a guild`,
  }
);

// Query command with nested subcommands
export const queryCommand = command(
  "query",
  object({
    command: constant("query"),
    subcommand: or(queryDmsCommand, queryGuildsCommand, queryChannelsCommand),
    verbose: option("-v", "--verbose", { description: message`Enable verbose output` }),
    tokenType: withDefault(
      option("-t", "--token-type", string({ metavar: "TYPE" }), { description: message`Token type: "user" or "bot"` }),
      "user"
    ),
  }),
  {
    brief: message`Query Discord resources (DMs, guilds, channels)`,
  }
);

// Export command with direct arguments
export const exportCommand = command(
  "export",
  object({
    command: constant("export"),
    channel: argument(string({ metavar: "CHANNEL_ID" })),
    output: optional(option("-o", "--output", path({ metavar: "FILE", mustExist: false, type: "file" }), { description: message`Output file path` })),
    format: withDefault(
      option("-f", "--format", choice(["json", "jsonl", "csv"], { metavar: "FORMAT" }), { description: message`Output format: json, jsonl, or csv` }),
      "json"
    ),
    batchSize: withDefault(
      option("-b", "--batch-size", integer({ metavar: "SIZE", min: 1, max: DISCORD_API.MAX_MESSAGES_PER_REQUEST }), { description: message`Messages per API request (1-100)` }),
      DISCORD_API.DEFAULT_BATCH_SIZE
    ),
    maxRetries: withDefault(
      option("-r", "--max-retries", integer({ metavar: "N", min: 0, max: 10 }), { description: message`Max retry attempts on failure` }),
      RETRY.MAX_RETRIES
    ),
    continue: option("-c", "--continue", { description: message`Resume a previous export` }),
    verbose: option("-v", "--verbose", { description: message`Enable verbose output` }),
    tokenType: withDefault(
      option("-t", "--token-type", string({ metavar: "TYPE" }), { description: message`Token type: "user" or "bot"` }),
      "user"
    ),
  }),
  {
    brief: message`Export messages from a channel`,
  }
);

// Main CLI parser that combines all commands
export const cliParser = or(
  queryCommand,
  exportCommand
);

// Export types for TypeScript usage
export type CliArgs = InferValue<typeof cliParser>;

import { choice, integer, string } from "@optique/core";
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
  })
);

export const queryGuildsCommand = command(
  "guild",
  object({
    queryType: constant("guild"),
  })
);

export const queryChannelsCommand = command(
  "channel",
  object({
    queryType: constant("channel"),
    guildId: argument(string({ metavar: "GUILD_ID" })),
  })
);

// Query command with nested subcommands
export const queryCommand = command(
  "query",
  object({
    command: constant("query"),
    subcommand: or(queryDmsCommand, queryGuildsCommand, queryChannelsCommand),
    verbose: option("-v", "--verbose"),
    tokenType: withDefault(
      option("-t", "--token-type", string({ metavar: "TYPE" })),
      "user"
    ),
  })
);

// Export command with direct arguments
export const exportCommand = command(
  "export",
  object({
    command: constant("export"),
    channel: argument(string({ metavar: "CHANNEL_ID" })),
    output: optional(option("-o", "--output", path({ metavar: "OUTPUT", mustExist: false, type: "file" }))),
    format: withDefault(
      option("-f", "--format", choice(["json", "jsonl", "csv"], { metavar: "FORMAT" })),
      "json"
    ),
    batchSize: withDefault(
      option("-b", "--batch-size", integer({ metavar: "BATCH_SIZE", min: 1, max: DISCORD_API.MAX_MESSAGES_PER_REQUEST })),
      DISCORD_API.DEFAULT_BATCH_SIZE
    ),
    maxRetries: withDefault(
      option("-r", "--max-retries", integer({ metavar: "RETRIES", min: 0, max: 10 })),
      RETRY.MAX_RETRIES
    ),
    continue: option("-c", "--continue"),
    verbose: option("-v", "--verbose"),
    tokenType: withDefault(
      option("-t", "--token-type", string({ metavar: "TYPE" })),
      "user"
    ),
  })
);

// Main CLI parser that combines all commands
export const cliParser = or(
  queryCommand,
  exportCommand
);

// Export types for TypeScript usage
export type CliArgs = InferValue<typeof cliParser>;

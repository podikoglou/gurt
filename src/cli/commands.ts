import { choice, integer, string } from "@optique/core";
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
    output: withDefault(
      argument(path({ metavar: "OUTPUT", mustExist: false, type: "file" })),
      "messages.json"
    ),
    format: withDefault(
      option("-f", "--format", choice(["json", "jsonl", "csv"], { metavar: "FORMAT" })),
      "json"
    ),
    batchSize: withDefault(
      option("-b", "--batch-size", integer({ metavar: "BATCH_SIZE", min: 1, max: 100 })),
      100
    ),
    continueFrom: optional(option("-c", "--continue", path({ metavar: "FILE", mustExist: true, type: "file" }))),
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

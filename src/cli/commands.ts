import { integer, string } from "@optique/core";
import {
  argument,
  command,
  constant,
  object,
  option,
  or,
  withDefault,
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
      option("-f", "--format", string({ metavar: "FORMAT" })),
      "json"
    ),
    batchSize: withDefault(
      option("-b", "--batch-size", integer({ metavar: "BATCH_SIZE", min: 1, max: 100 })),
      100
    ),
  })
);

// Main CLI parser that combines all commands
export const cliParser = or(
  queryCommand,
  exportCommand
);

// Export types for TypeScript usage
export type CliArgs = ReturnType<typeof cliParser>;
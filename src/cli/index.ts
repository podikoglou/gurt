import { run } from "@optique/core/facade";
import { cliParser, type CliArgs } from "./commands.js";
import { DiscordApiClient } from "../api/discord-client.js";
import { TokenBucketRateLimiter } from "../api/rate-limiter.js";
import { MessageService } from "../services/message-service.js";
import { ChannelService } from "../services/channel-service.js";
import { ExportOrchestrator } from "../core/export-orchestrator.js";
import { JsonExporter, JsonlExporter } from "../exporters/index.js";
import type { ExporterFactory } from "../types/export.js";

function validateEnvironment(): void {
  if (!process.env.DISCORD_TOKEN) {
    console.error("Error: DISCORD_TOKEN environment variable is required");
    console.error("Please set your Discord bot or user token:");
    console.error("  export DISCORD_TOKEN='your_token_here'");
    process.exit(1);
  }
}

function initializeServices(verbose = false, tokenType: "bot" | "user" = "user") {
  const token = process.env.DISCORD_TOKEN!;
  const rateLimiter = new TokenBucketRateLimiter();
  const apiClient = new DiscordApiClient(token, rateLimiter, {}, verbose, tokenType);
  const messageService = new MessageService(apiClient);
  const channelService = new ChannelService(apiClient);

  const exporterFactories = new Map<string, ExporterFactory>();
  exporterFactories.set("json", () => new JsonExporter());
  exporterFactories.set("jsonl", () => new JsonlExporter());

  const exportOrchestrator = new ExportOrchestrator(
    messageService,
    channelService,
    exporterFactories
  );

  return {
    apiClient,
    messageService,
    channelService,
    exportOrchestrator,
  };
}

async function handleQueryDms(
  { channelService }: ReturnType<typeof initializeServices>,
  verbose = false
): Promise<void> {
  try {
    const dmChannels = await channelService.getDmChannels();
    const groupDmChannels = await channelService.getGroupDmChannels();

    if (dmChannels.length === 0 && groupDmChannels.length === 0) {
      return;
    }

    if (dmChannels.length > 0) {
      for (const dm of dmChannels) {
        const name = dm.recipient_ids && dm.recipient_ids.length > 0 ? dm.recipient_ids[0] : "Unknown";
        console.log(`${dm.id} ${name}`);
      }
    }

    if (groupDmChannels.length > 0) {
      for (const groupDm of groupDmChannels) {
        const name = groupDm.name || `Group ${groupDm.recipient_ids?.length || 0}`;
        console.log(`${groupDm.id} ${name}`);
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
}

async function handleQueryGuilds(
  { channelService }: ReturnType<typeof initializeServices>,
  verbose = false
): Promise<void> {
  try {
    const guilds = await channelService.getGuilds();

    for (const guild of guilds) {
      console.log(`${guild.id} ${guild.name}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
}

async function handleQueryChannels(
  args: { guildId: string },
  { channelService }: ReturnType<typeof initializeServices>,
  verbose = false
): Promise<void> {
  try {
    const channels = await channelService.getGuildTextChannels(args.guildId as any);

    for (const channel of channels) {
      const nsfw = channel.nsfw ? " [NSFW]" : "";
      console.log(`${channel.id} ${channel.name}${nsfw}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
}

async function handleExport(
  args: {
    channel: string;
    output: string;
    format?: string;
    batchSize?: number;
    verbose?: boolean;
  },
  { exportOrchestrator }: ReturnType<typeof initializeServices>
): Promise<void> {
  try {
    const config = exportOrchestrator.createExportConfig({
      channel: args.channel,
      output: args.output,
      format: args.format,
      batchSize: args.batchSize,
    });

    const result = await exportOrchestrator.exportChannel(config, (progress) => {
      const bar = "=".repeat(Math.floor(progress.percentage / 2));
      const empty = " ".repeat(50 - Math.floor(progress.percentage / 2));
      process.stdout.write(`\r[${bar}${empty}] ${progress.percentage.toFixed(0)}%`);
    });

    console.log(`\nExported ${result.messageCount} messages to ${result.file}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  try {
    const result = run(cliParser, "gurt", process.argv.slice(2), {
      help: { mode: "option" },
    });

    validateEnvironment();

    const verbose = !!result.verbose;
    const tokenType = (result.tokenType as "bot" | "user") || "user";
    const services = initializeServices(verbose, tokenType);

    if (result.command === "query") {
      switch (result.subcommand.queryType) {
        case "dm":
          await handleQueryDms(services, verbose);
          break;
        case "guild":
          await handleQueryGuilds(services, verbose);
          break;
        case "channel":
          await handleQueryChannels(result.subcommand, services, verbose);
          break;
        default:
          console.error("Unknown query type:", result);
          process.exit(1);
      }
    } else if (result.command === "export") {
      await handleExport(result, services);
    } else {
      console.error("Unknown command:", result);
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error:", error.message);
    } else {
      console.error("An unknown error occurred");
    }
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { main };

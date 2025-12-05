import { run } from "@optique/core/facade";
import { cliParser, type CliArgs } from "./commands.js";
import { DiscordApiClient } from "../api/discord-client.js";
import { TokenBucketRateLimiter } from "../api/rate-limiter.js";
import { MessageService } from "../services/message-service.js";
import { ChannelService } from "../services/channel-service.js";
import { ExportOrchestrator } from "../core/export-orchestrator.js";
import { JsonExporter } from "../exporters/json.js";
import { ExportFormat } from "../types/export.js";

// Function to validate environment variables
function validateEnvironment(): void {
  if (!process.env.DISCORD_TOKEN) {
    console.error("Error: DISCORD_TOKEN environment variable is required");
    console.error("Please set your Discord bot or user token:");
    console.error("  export DISCORD_TOKEN='your_token_here'");
    process.exit(1);
  }
}

// Initialize services
function initializeServices() {
  const token = process.env.DISCORD_TOKEN!;
  const rateLimiter = new TokenBucketRateLimiter();
  const apiClient = new DiscordApiClient(token, rateLimiter);
  const messageService = new MessageService(apiClient);
  const channelService = new ChannelService(apiClient);

  // Register exporters
  const exporters = new Map<string, any>();
  exporters.set(ExportFormat.JSON, new JsonExporter());

  const exportOrchestrator = new ExportOrchestrator(
    messageService,
    channelService,
    exporters
  );

  return {
    apiClient,
    messageService,
    channelService,
    exportOrchestrator,
  };
}

// Query handlers
async function handleQueryDms({ channelService }: ReturnType<typeof initializeServices>): Promise<void> {
  console.log("Fetching direct message conversations...\n");

  try {
    const dmChannels = await channelService.getDmChannels();
    const groupDmChannels = await channelService.getGroupDmChannels();

    if (dmChannels.length === 0 && groupDmChannels.length === 0) {
      console.log("No DM conversations found.");
      return;
    }

    // Display DMs
    if (dmChannels.length > 0) {
      console.log(`Direct Messages (${dmChannels.length}):`);
      console.log("----------------------------------------");
      for (const dm of dmChannels) {
        const name = dm.recipientIds.length > 0 ? `User ${dm.recipientIds[0]}` : "Unknown User";
        console.log(`  ${dm.id} - ${name}`);
      }
      console.log();
    }

    // Display Group DMs
    if (groupDmChannels.length > 0) {
      console.log(`Group DMs (${groupDmChannels.length}):`);
      console.log("----------------------------------------");
      for (const groupDm of groupDmChannels) {
        const name = groupDm.name || `Group (${groupDm.recipientIds.length} members)`;
        console.log(`  ${groupDm.id} - ${name}`);
      }
      console.log();
    }

    console.log(`Total: ${dmChannels.length + groupDmChannels.length} conversations`);
  } catch (error) {
    console.error("Failed to fetch DMs:", error instanceof Error ? error.message : error);
  }
}

async function handleQueryGuilds({ channelService }: ReturnType<typeof initializeServices>): Promise<void> {
  console.log("Fetching accessible guilds...\n");

  try {
    const guilds = await channelService.getGuilds();

    if (guilds.length === 0) {
      console.log("No guilds found.");
      return;
    }

    console.log(`Guilds (${guilds.length}):`);
    console.log("----------------------------------------");
    for (const guild of guilds) {
      const memberCount = guild.memberCount ? ` (${guild.memberCount} members)` : "";
      console.log(`  ${guild.id} - ${guild.name}${memberCount}`);
    }
    console.log();
    console.log(`Total: ${guilds.length} guilds`);
  } catch (error) {
    console.error("Failed to fetch guilds:", error instanceof Error ? error.message : error);
  }
}

async function handleQueryChannels(
  args: { guildId: string },
  { channelService }: ReturnType<typeof initializeServices>
): Promise<void> {
  console.log(`Fetching channels for guild ${args.guildId}...\n`);

  try {
    const channels = await channelService.getGuildTextChannels(args.guildId);

    if (channels.length === 0) {
      console.log("No text channels found in this guild.");
      return;
    }

    // Group channels by category
    const categories = new Map<string, typeof channels>();
    const uncategorized: typeof channels = [];

    for (const channel of channels) {
      if (channel.parentId) {
        if (!categories.has(channel.parentId)) {
          categories.set(channel.parentId, []);
        }
        categories.get(channel.parentId)!.push(channel);
      } else {
        uncategorized.push(channel);
      }
    }

    // Display channels
    console.log(`Text Channels (${channels.length}):`);
    console.log("----------------------------------------");

    // Uncategorized channels first
    if (uncategorized.length > 0) {
      console.log("\n📁 No Category:");
      for (const channel of uncategorized) {
        const nsfw = channel.nsfw ? " [NSFW]" : "";
        const topic = channel.topic ? ` - ${channel.topic.substring(0, 50)}` : "";
        console.log(`  ${channel.id} - ${channel.name}${nsfw}${topic}`);
      }
    }

    // Categorized channels
    for (const [categoryId, categoryChannels] of categories) {
      console.log(`\n📁 Category ${categoryId}:`);
      for (const channel of categoryChannels) {
        const nsfw = channel.nsfw ? " [NSFW]" : "";
        const topic = channel.topic ? ` - ${channel.topic.substring(0, 50)}` : "";
        console.log(`  ${channel.id} - ${channel.name}${nsfw}${topic}`);
      }
    }

    console.log();
    console.log(`Total: ${channels.length} text channels`);
  } catch (error) {
    console.error("Failed to fetch channels:", error instanceof Error ? error.message : error);
  }
}

// Export handler
async function handleExport(
  args: {
    channel: string;
    output: string;
    format?: string;
    batchSize?: number;
  },
  { exportOrchestrator }: ReturnType<typeof initializeServices>
): Promise<void> {
  console.log(`Starting export of channel ${args.channel}...\n`);

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
      process.stdout.write(`\rProgress: [${bar}${empty}] ${progress.percentage.toFixed(1)}% (${progress.messageCount} messages)`);
    });

    console.log(); // New line after progress bar

    console.log("\nExport completed successfully!");
    console.log(`Messages: ${result.messageCount}`);
    console.log(`Attachments: ${result.attachmentCount}`);
    console.log(`Embeds: ${result.embedCount}`);
    if (result.filtered > 0) {
      console.log(`Filtered out: ${result.filtered} messages`);
    }
    console.log(`File: ${result.file}`);
    console.log(`Size: ${(result.size / 1024).toFixed(1)} KB`);
    console.log(`Duration: ${(result.duration / 1000).toFixed(2)} seconds`);

    if (result.startDate && result.endDate) {
      console.log(`Date range: ${result.startDate.toLocaleDateString()} to ${result.endDate.toLocaleDateString()}`);
    }
  } catch (error) {
    console.error("\nExport failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Main CLI function
async function main(): Promise<void> {
  try {
    // Parse command line arguments first
    const result = run(cliParser, "gurt", process.argv.slice(2), {
      help: { mode: "option" },
    });

    // If parsing succeeded, validate environment and initialize services
    validateEnvironment();
    const services = initializeServices();

    // Route to appropriate handler based on command and subcommand
    if (result.command === "query") {
      switch (result.subcommand.queryType) {
        case "dm":
          await handleQueryDms(services);
          break;
        case "guild":
          await handleQueryGuilds(services);
          break;
        case "channel":
          await handleQueryChannels(result.subcommand, services);
          break;
        default:
          console.error("Unknown query type:", result);
          process.exit(1);
      }
    } else if (result.command === "export") {
      await handleExport(result, services);
    } else {
      // This should never happen due to optique's type safety
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

// Run the CLI if this file is executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { main };
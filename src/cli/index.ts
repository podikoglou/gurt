import { run } from "@optique/core/facade";
import { cliParser, type CliArgs } from "./commands.js";

// Function to validate environment variables
function validateEnvironment(): void {
  if (!process.env.DISCORD_TOKEN) {
    console.error("Error: DISCORD_TOKEN environment variable is required");
    console.error("Please set your Discord bot or user token:");
    console.error("  export DISCORD_TOKEN='your_token_here'");
    process.exit(1);
  }
}

// Query handlers
async function handleQueryDms(): Promise<void> {
  console.log("Query DMs command received");
  console.log("This will list all direct message conversations");
  // TODO: Implement actual DM listing logic
}

async function handleQueryGuilds(): Promise<void> {
  console.log("Query guilds command received");
  console.log("This will list all accessible guilds");
  // TODO: Implement actual guild listing logic
}

async function handleQueryChannels(args: any): Promise<void> {
  console.log("Query channels command received:", args);
  console.log(`This will list channels in guild ${args.guildId}`);
  // TODO: Implement actual channel listing logic
}

// Export handler
async function handleExport(args: any): Promise<void> {
  console.log("Export command received:");
  console.log("  Arguments:", args);
  console.log(`This will export channel ${args.channel} to ${args.output}`);
  // TODO: Implement actual channel export logic
}

// Main CLI function
async function main(): Promise<void> {
  try {
    // Parse command line arguments first
    const result = run(cliParser, "gurt", process.argv.slice(2), {
      help: { mode: "option" },
    });

    // If parsing succeeded, validate environment
    validateEnvironment();

    // Route to appropriate handler based on command and subcommand
    if (result.command === "query") {
      switch (result.subcommand.queryType) {
        case "dm":
          await handleQueryDms();
          break;
        case "guild":
          await handleQueryGuilds();
          break;
        case "channel":
          await handleQueryChannels(result.subcommand);
          break;
        default:
          console.error("Unknown query type:", result);
          process.exit(1);
      }
    } else if (result.command === "export") {
      await handleExport(result);
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
# gurt-export

Little Discord chat exporter written in TypeScript. Can export in to:

- JSON
- JSONL
- CSV

## Quick Start

```bash
# Set your Discord token
export DISCORD_TOKEN="your_token_here"

# Export a channel
npx gurt-export export CHANNEL_ID
```

## Usage

### Finding Channels to Export

```bash
# List your DMs
npx gurt-export query dm

# List servers you're in
npx gurt-export query guild

# List channels in a server
npx gurt-export query channel GUILD_ID
```

### Exporting Messages

```bash
# Export to JSON (default)
npx gurt-export export CHANNEL_ID

# Export to a specific file
npx gurt-export export CHANNEL_ID -o backup.json

# Export as CSV or JSONL
npx gurt-export export CHANNEL_ID -f csv
npx gurt-export export CHANNEL_ID -f jsonl

# Resume an interrupted export
npx gurt-export export CHANNEL_ID -o backup.json --continue
```

### Export Options

```
export <CHANNEL_ID>
  -o, --output <FILE>       Output file (default: CHANNEL_ID.format)
  -f, --format <FORMAT>     json, jsonl, or csv (default: json)
  -b, --batch-size <SIZE>   Messages per request, 1-100 (default: 100)
  -r, --max-retries <N>     Retry attempts on failure (default: 3)
  -c, --continue            Resume a previous export
  -t, --token-type <TYPE>   "user" or "bot" (default: user)
  -v, --verbose             Show detailed output
  -h, --help                Show help
```

## Getting Your Discord Token

### User Token

1. Open Discord in your browser
2. Press `F12` to open Developer Tools
3. Go to the **Network** tab
4. Send a message or refresh
5. Click any request to `discord.com/api`
6. Find the `Authorization` header — that's your token

> ⚠️ **Keep your token secret.** Anyone with it can access your account.

### Bot Token

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create an application → Add a bot
3. Copy the bot token
4. Use with `-t bot` flag

## Installation (Optional)

While `npx gurt-export` works without installing, you can also:

```bash
# Install globally with npm
npm install -g gurt-export

# Then use directly
gurt-export export CHANNEL_ID
```

Or with bun/pnpm:

```bash
bun install -g gurt-export export CHANNEL_ID
pnpm install -g gurt-export export CHANNEL_ID
```

## License

MIT

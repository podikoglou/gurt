// Discord API client implementation using ky HTTP library

import ky, { HTTPError } from "ky";
import type {
  ApiClient,
  RateLimiter,
  RetryConfig,
} from "./client";
import {
  ApiError,
  RateLimitError,
  AuthenticationError,
  PermissionError,
  NotFoundError,
  DEFAULT_RETRY_CONFIG,
} from "./client";
import type {
  User,
  Channel,
  Guild,
  Message,
  Snowflake,
  RateLimitInfo,
} from "../types/discord";
import { extractRoute } from "./rate-limiter";

// Discord API client with authentication, rate limiting, and retry logic
export class DiscordApiClient implements ApiClient {
  private readonly client: typeof ky;
  private readonly token: string;
  private readonly tokenType: "Bot" | "Bearer";
  private readonly rateLimiter: RateLimiter;
  private readonly retryConfig: RetryConfig;
  private verbose = false;

  constructor(
    token: string,
    rateLimiter: RateLimiter,
    retryConfig: Partial<RetryConfig> = {},
    verbose = false
  ) {
    this.verbose = verbose;
    this.token = token;
    this.rateLimiter = rateLimiter;
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...retryConfig,
    };

    // Keep the original token intact, just detect type for logging
    if (token.startsWith("Bot ")) {
      this.tokenType = "Bot";
      this.token = token; // Keep "Bot " prefix intact
    } else if (token.startsWith("Bearer ")) {
      this.tokenType = "Bearer";
      this.token = token; // Keep "Bearer " prefix intact
    } else {
      // Default to Bot token - add prefix if not present
      this.tokenType = "Bot";
      this.token = `Bot ${token}`; // Add "Bot " prefix
    }

    // Configure ky client
    this.client = ky.create({
      prefixUrl: "https://discord.com/api/v10",
      timeout: 30000,
      hooks: {
        beforeRequest: [
          (request) => {
            // Add authorization header
            request.headers.set("Authorization", this.token);
            request.headers.set("User-Agent", "Gurt (https://github.com/apodikoglou/gurt, 1.0.0)");

            // Debug logging
            if (this.verbose || process.env.NODE_ENV === "development" || process.env.DEBUG) {
              const tokenPreview = this.token.substring(0, Math.min(this.token.length, 20));
              console.error(`[DEBUG] Request: ${request.method} ${request.url}`);
              console.error(`[DEBUG] Token starts with: ${tokenPreview}... (type: ${this.tokenType})`);
            }
          },
        ],
        afterResponse: [
          async (request, options, response) => {
            // Update rate limit headers
            await this.updateRateLimits(request, response);

            // Handle rate limit errors
            if (response.status === 429) {
              const data = await response.json().catch(() => ({})) as any;
              throw new RateLimitError(
                data.message || "Rate limited",
                data.retry_after || 1,
                data.global || false,
                data
              );
            }
          },
        ],
        beforeRetry: [
          async ({ error, retryCount }) => {
            if (error instanceof RateLimitError && !error.global) {
              // For non-global rate limits, wait the specified time
              await this.delay(error.retryAfter * 1000);
            } else {
              // Exponential backoff for other errors
              const delay = Math.min(
                this.retryConfig.baseDelay *
                  Math.pow(this.retryConfig.backoffMultiplier, retryCount),
                this.retryConfig.maxDelay
              );
              await this.delay(delay);
            }
          },
        ],
      },
      retry: {
        limit: this.retryConfig.maxRetries,
        methods: ["get", "post", "put", "patch", "delete"],
        statusCodes: this.retryConfig.retryableStatusCodes,
      },
    });
  }

  // Generic HTTP method with rate limiting and error handling
  async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    params?: Record<string, unknown>
  ): Promise<T> {
    const route = extractRoute(endpoint);

    // Wait for rate limit if needed
    await this.rateLimiter.checkLimit(route);

    try {
      const response = await this.client(endpoint, {
        method,
        json: body,
        searchParams: params ? new URLSearchParams(params as Record<string, string>) : undefined,
      });

      // Handle 204 No Content
      if (response.status === 204) {
        return null as T;
      }

      return response.json<T>();
    } catch (error) {
      if (error instanceof HTTPError) {
        const status = error.response.status;
        const data = await error.response.json().catch(() => ({}));

        // Convert HTTP errors to specific error types
        switch (status) {
          case 401:
            const authMsg = data.message || "Authentication failed";
            if (this.verbose) {
              console.error(`\n[VERBOSE] Authentication failed. Please check:\n` +
                           `1. Your DISCORD_TOKEN is correct\n` +
                           `2. The token has the right permissions\n` +
                           `3. The token hasn't expired\n`);
            }
            throw new AuthenticationError(authMsg, data);
          case 403:
            throw new PermissionError(data.message, data);
          case 404:
            throw new NotFoundError(data.message, data);
          case 429:
            // Should be handled by afterResponse hook, but just in case
            throw new RateLimitError(
              data.message || "Rate limited",
              data.retry_after || 1,
              data.global || false,
              data
            );
          default:
            throw new ApiError(
              data.message || `HTTP ${status}`,
              status,
              data.code,
              data
            );
        }
      } else if (error instanceof RateLimitError) {
        // Re-throw rate limit errors
        throw error;
      } else if (error instanceof Error) {
        // Wrap other errors
        throw new ApiError(error.message);
      } else {
        throw new ApiError("Unknown error occurred");
      }
    }
  }

  async get<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>("GET", endpoint, undefined, params);
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", endpoint, body);
  }

  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", endpoint, body);
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", endpoint, body);
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>("DELETE", endpoint);
  }

  // Discord API specific methods

  async getMessages(
    channelId: Snowflake,
    options: {
      limit?: number;
      before?: Snowflake;
      after?: Snowflake;
      around?: Snowflake;
    } = {}
  ): Promise<Message[]> {
    const params: Record<string, string> = {};

    if (options.limit) params.limit = options.limit.toString();
    if (options.before) params.before = options.before;
    if (options.after) params.after = options.after;
    if (options.around) params.around = options.around;

    return this.get<Message[]>(`channels/${channelId}/messages`, params);
  }

  async getMessage(channelId: Snowflake, messageId: Snowflake): Promise<Message> {
    return this.get<Message>(`channels/${channelId}/messages/${messageId}`);
  }

  async getDmChannels(): Promise<Channel[]> {
    return this.get<Channel[]>("users/@me/channels");
  }

  async getGuilds(): Promise<Guild[]> {
    return this.get<Guild[]>("users/@me/guilds");
  }

  async getGuildChannels(guildId: Snowflake): Promise<Channel[]> {
    return this.get<Channel[]>(`guilds/${guildId}/channels`);
  }

  async getChannel(channelId: Snowflake): Promise<Channel> {
    return this.get<Channel>(`channels/${channelId}`);
  }

  async getUser(userId: Snowflake): Promise<User> {
    return this.get<User>(`users/${userId}`);
  }

  async getCurrentUser(): Promise<User> {
    return this.get<User>("users/@me");
  }

  // Private helper methods

  private async updateRateLimits(request: Request, response: Response): Promise<void> {
    const route = extractRoute(request.url);

    const limit = response.headers.get("X-RateLimit-Limit");
    const remaining = response.headers.get("X-RateLimit-Remaining");
    const resetAfter = response.headers.get("X-RateLimit-Reset-After");
    const global = response.headers.get("X-RateLimit-Global");
    const retryAfter = response.headers.get("Retry-After");

    if (limit && remaining && resetAfter) {
      const info: RateLimitInfo = {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        resetAfter: parseFloat(resetAfter),
        global: global === "true",
        retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
      };

      this.rateLimiter.updateLimit(route, info);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
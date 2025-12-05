import ky, { HTTPError } from "ky";
import type {
  ApiClient,
  RateLimiter,
  RetryConfig,
} from "./client";
import { delay } from "../utils/delay.js";
import {
  ApiError,
  RateLimitError,
  AuthenticationError,
  PermissionError,
  NotFoundError,
  DEFAULT_RETRY_CONFIG,
} from "./client";
import type {
  Snowflake,
  RateLimitInfo,
} from "../types/discord";
import { extractRoute } from "./rate-limiter";

/**
 * Discord API client with authentication, rate limiting, and retry logic
 *
 * Features:
 * - Automatic token management (Bot/User)
 * - Rate limit handling with respect to Discord's headers
 * - Exponential backoff retry strategy
 * - Comprehensive error handling
 */
export class DiscordApiClient implements ApiClient {
  private readonly client: typeof ky;
  private readonly token: string;
  private readonly rateLimiter: RateLimiter;
  private readonly retryConfig: RetryConfig;
  private verbose = false;

  constructor(
    token: string,
    rateLimiter: RateLimiter,
    retryConfig: Partial<RetryConfig> = {},
    verbose = false,
    tokenType: "bot" | "user" = "user"
  ) {
    this.verbose = verbose;
    this.rateLimiter = rateLimiter;
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...retryConfig,
    };

    if (token.startsWith("Bot ") || token.startsWith("Bearer ")) {
      this.token = token;
    } else {
      this.token = tokenType === "bot" ? `Bot ${token}` : token;
    }

    this.client = ky.create({
      prefixUrl: "https://discord.com/api/v10",
      timeout: 30000,
      hooks: {
        beforeRequest: [
          (request) => {
            request.headers.set("Authorization", this.token);
            request.headers.set("User-Agent", "Gurt (https://github.com/apodikoglou/gurt, 1.0.0)");

            if (this.verbose || process.env.NODE_ENV === "development" || process.env.DEBUG) {
              console.error(`[DEBUG] Request: ${request.method} ${request.url}`);
            }
          },
        ],
        afterResponse: [
          async (request, options, response) => {
            await this.updateRateLimits(request, response);

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
              await delay(error.retryAfter * 1000);
            } else {
              const backoffDelay = Math.min(
                this.retryConfig.baseDelay *
                  Math.pow(this.retryConfig.backoffMultiplier, retryCount),
                this.retryConfig.maxDelay
              );
              await delay(backoffDelay);
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

  async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    params?: Record<string, unknown>
  ): Promise<T> {
    const route = extractRoute(endpoint);

    await this.rateLimiter.checkLimit(route);

    try {
      const response = await this.client(endpoint, {
        method,
        json: body,
        searchParams: params ? new URLSearchParams(params as Record<string, string>) : undefined,
      });

      if (response.status === 204) {
        return null as T;
      }

      return response.json<T>();
    } catch (error) {
      if (error instanceof HTTPError) {
        const status = error.response.status;
        const data = await error.response.json().catch(() => ({}));

        switch (status) {
          case 401:
            const authMsg = data.message || "Authentication failed";
            if (this.verbose) {
              console.error(`Authentication failed. Check DISCORD_TOKEN and token type.`);
            }
            throw new AuthenticationError(authMsg, data);
          case 403:
            throw new PermissionError(data.message, data);
          case 404:
            throw new NotFoundError(data.message, data);
          case 429:
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
        throw error;
      } else if (error instanceof Error) {
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
  ): Promise<unknown[]> {
    const params: Record<string, string> = {};

    if (options.limit) params.limit = options.limit.toString();
    if (options.before) params.before = options.before;
    if (options.after) params.after = options.after;
    if (options.around) params.around = options.around;

    return this.get<unknown[]>(`channels/${channelId}/messages`, params);
  }

  async getMessage(channelId: Snowflake, messageId: Snowflake): Promise<unknown> {
    return this.get<unknown>(`channels/${channelId}/messages/${messageId}`);
  }

  async getDmChannels(): Promise<unknown[]> {
    return this.get<unknown[]>("users/@me/channels");
  }

  async getGuilds(): Promise<unknown[]> {
    return this.get<unknown[]>("users/@me/guilds");
  }

  async getGuildChannels(guildId: Snowflake): Promise<unknown[]> {
    return this.get<unknown[]>(`guilds/${guildId}/channels`);
  }

  async getChannel(channelId: Snowflake): Promise<unknown> {
    return this.get<unknown>(`channels/${channelId}`);
  }

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


}

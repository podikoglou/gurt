import type { RateLimitInfo } from "../types/discord.js";
import { RETRY } from "../utils/constants.js";

/**
 * Generic HTTP API client interface for Discord API operations
 */
export interface ApiClient {
  get<T>(endpoint: string, params?: Record<string, unknown>): Promise<T>;
  post<T>(endpoint: string, body?: unknown): Promise<T>;
  put<T>(endpoint: string, body?: unknown): Promise<T>;
  patch<T>(endpoint: string, body?: unknown): Promise<T>;
  delete<T>(endpoint: string): Promise<T>;
}

/**
 * Rate limiter interface for Discord API rate limit handling
 */
export interface RateLimiter {
  checkLimit(route: string): Promise<void>;
  updateLimit(route: string, info: RateLimitInfo): void;
  getGlobalDelay(): number;
}

/**
 * Configuration for retry logic on failed API requests
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
}

/**
 * Default retry configuration for Discord API
 * - Exponential backoff with 2x multiplier
 * - Retries on rate limits (429) and server errors (5xx)
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: RETRY.MAX_RETRIES,
  baseDelay: RETRY.BASE_DELAY_MS,
  maxDelay: RETRY.MAX_DELAY_MS,
  backoffMultiplier: RETRY.BACKOFF_MULTIPLIER,
  retryableStatusCodes: [...RETRY.RETRYABLE_STATUS_CODES],
};
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string,
    public readonly response?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class RateLimitError extends ApiError {
  public readonly retryAfter: number;
  public readonly global: boolean;

  constructor(
    message: string,
    retryAfter: number,
    global: boolean = false,
    response?: unknown
  ) {
    super(message, 429, "RATE_LIMITED", response);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
    this.global = global;
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = "Authentication failed", response?: unknown) {
    super(message, 401, "AUTHENTICATION_ERROR", response);
    this.name = "AuthenticationError";
  }
}

export class PermissionError extends ApiError {
  constructor(message: string = "Insufficient permissions", response?: unknown) {
    super(message, 403, "PERMISSION_ERROR", response);
    this.name = "PermissionError";
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = "Resource not found", response?: unknown) {
    super(message, 404, "NOT_FOUND", response);
    this.name = "NotFoundError";
  }
}

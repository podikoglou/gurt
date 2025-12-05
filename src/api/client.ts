// Base API client interfaces and types

import type { Snowflake, RateLimitInfo } from "../types/discord.js";

// Generic API client interface
export interface ApiClient {
  get<T>(endpoint: string, params?: Record<string, unknown>): Promise<T>;
  post<T>(endpoint: string, body?: unknown): Promise<T>;
  put<T>(endpoint: string, body?: unknown): Promise<T>;
  patch<T>(endpoint: string, body?: unknown): Promise<T>;
  delete<T>(endpoint: string): Promise<T>;
}

// Rate limiter interface
export interface RateLimiter {
  checkLimit(route: string): Promise<void>;
  updateLimit(route: string, info: RateLimitInfo): void;
  getGlobalDelay(): number;
}

// Retry configuration for API requests
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
  retryableErrors: string[];
}

// Default retry configuration
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  retryableErrors: [
    "NETWORK_ERROR",
    "TIMEOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "ENOTFOUND",
  ],
};

// API error types
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
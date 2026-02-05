import { z, ZodError } from "zod";
import {
  clientToServerEvents,
  serverToClientEvents,
  ClientToServerEventName,
  ServerToClientEventName,
  SocketEventMetadata,
} from "./tribes-socket";
import { limits, RateLimitOptions } from "./rate-limit";

// ============================================================================
// Validation Helpers
// ============================================================================

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ZodError };

/**
 * Validate an inbound payload against the contract schema
 */
export function validateInboundPayload<E extends ClientToServerEventName>(
  eventName: E,
  payload: unknown,
): ValidationResult<z.infer<(typeof clientToServerEvents)[E]["payload"]>> {
  const event = clientToServerEvents[eventName];

  const result = event.payload.safeParse(payload);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Validate an outbound payload against the contract schema
 */
export function validateOutboundPayload<E extends ServerToClientEventName>(
  eventName: E,
  payload: unknown,
): ValidationResult<z.infer<(typeof serverToClientEvents)[E]["payload"]>> {
  const event = serverToClientEvents[eventName];

  const result = event.payload.safeParse(payload);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

// ============================================================================
// Metadata Helpers
// ============================================================================

/**
 * Get metadata for a client->server event
 */
export function getEventMetadata(
  eventName: ClientToServerEventName,
): SocketEventMetadata | undefined {
  return clientToServerEvents[eventName]?.metadata;
}

/**
 * Check if an event requires authentication
 */
export function eventRequiresAuth(eventName: ClientToServerEventName): boolean {
  const metadata = getEventMetadata(eventName);
  return metadata?.isPublic !== true;
}

/**
 * Get rate limit configuration for an event
 */
export function getEventRateLimit(
  eventName: ClientToServerEventName,
): RateLimitOptions | undefined {
  const metadata = getEventMetadata(eventName);
  if (
    metadata === undefined ||
    metadata.rateLimit === undefined ||
    metadata.rateLimit === ""
  ) {
    return undefined;
  }

  const limitKey = metadata.rateLimit as keyof typeof limits;
  return limits[limitKey];
}

// ============================================================================
// Error Response Helpers
// ============================================================================

export type SocketErrorResponse = {
  ok: false;
  error: string;
  status: number;
};

export type SocketSuccessResponse<T = unknown> = {
  ok: true;
  data?: T;
};

export type SocketResponse<T = unknown> =
  | SocketSuccessResponse<T>
  | SocketErrorResponse;

export function createErrorResponse(
  status: number,
  message: string,
): SocketErrorResponse {
  return { ok: false, error: message, status };
}

export function createSuccessResponse<T>(data?: T): SocketSuccessResponse<T> {
  return { ok: true, data };
}

// Common error responses
export const SocketErrors = {
  unauthorized: () => createErrorResponse(401, "Authentication required"),
  forbidden: () => createErrorResponse(403, "Permission denied"),
  notFound: (resource: string) =>
    createErrorResponse(404, `${resource} not found`),
  badRequest: (message: string) => createErrorResponse(400, message),
  rateLimited: () => createErrorResponse(429, "Rate limit exceeded"),
  internalError: () => createErrorResponse(500, "Internal server error"),
  validationError: (error: ZodError) =>
    createErrorResponse(422, formatZodError(error)),
} as const;

/**
 * Format a ZodError into a human-readable string
 */
export function formatZodError(error: ZodError): string {
  return error.errors
    .map((e) => {
      const path = e.path.length > 0 ? `${e.path.join(".")}: ` : "";
      return `${path}${e.message}`;
    })
    .join("; ");
}

// ============================================================================
// Rate Limiting Helpers
// ============================================================================

export type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitStore = Map<string, RateLimitEntry>;

/**
 * Convert window to milliseconds
 */
export function windowToMs(window: RateLimitOptions["window"]): number {
  if (typeof window === "number") return window;
  switch (window) {
    case "second":
      return 1000;
    case "minute":
      return 60 * 1000;
    case "hour":
      return 60 * 60 * 1000;
    case "day":
      return 24 * 60 * 60 * 1000;
    default:
      return 60 * 1000; // Default to 1 minute
  }
}

/**
 * Check rate limit and return whether the request should be allowed
 */
export function checkRateLimit(
  store: RateLimitStore,
  key: string,
  options: RateLimitOptions,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const windowMs = windowToMs(options.window);
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    // Create new entry
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + windowMs,
    };
    store.set(key, newEntry);
    return {
      allowed: true,
      remaining: options.max - 1,
      resetAt: newEntry.resetAt,
    };
  }

  if (entry.count >= options.max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: options.max - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Clean up expired rate limit entries
 */
export function cleanupRateLimitStore(store: RateLimitStore): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now >= entry.resetAt) {
      store.delete(key);
    }
  }
}

// ============================================================================
// HTML Sanitization
// ============================================================================

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(str: string): string {
  return str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Sanitize user-provided name
 */
export function sanitizeName(name: string, maxLength = 16): string {
  return escapeHtml(name).substring(0, maxLength).trim();
}

/**
 * Sanitize chat message
 */
export function sanitizeMessage(message: string, maxLength = 200): string {
  return escapeHtml(message).substring(0, maxLength);
}

/**
 * Sanitize room name
 */
export function sanitizeRoomName(name: string, maxLength = 50): string {
  return escapeHtml(name).substring(0, maxLength).trim();
}

// ============================================================================
// Type Exports
// ============================================================================

export type {
  ClientToServerEventName,
  ServerToClientEventName,
  SocketEventMetadata,
};
export { clientToServerEvents, serverToClientEvents };

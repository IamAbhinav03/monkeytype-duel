import {
  checkRateLimit,
  cleanupRateLimitStore,
  getEventRateLimit,
  type RateLimitStore,
} from "@monkeytype/contracts/socket-contract";
import type { ClientToServerEventName } from "@monkeytype/contracts/tribes-socket";
import Logger from "../utils/logger.js";

// ============================================================================
// Rate Limit Stores
// ============================================================================

// Per-socket rate limiting
const socketRateLimits: RateLimitStore = new Map();

// Per-user (uid) rate limiting for authenticated users
const userRateLimits: RateLimitStore = new Map();

// Cleanup interval
let cleanupInterval: NodeJS.Timeout | undefined;

// ============================================================================
// Rate Limit Checking
// ============================================================================

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Check if a socket event is rate limited
 */
export function checkSocketRateLimit(
  socketId: string,
  uid: string | undefined,
  eventName: ClientToServerEventName,
): RateLimitResult {
  const options = getEventRateLimit(eventName);

  // No rate limit configured for this event
  if (!options) {
    return { allowed: true, remaining: Infinity, resetAt: 0 };
  }

  // Check socket-based rate limit
  const socketKey = `${socketId}:${eventName}`;
  const socketResult = checkRateLimit(socketRateLimits, socketKey, options);

  if (!socketResult.allowed) {
    return socketResult;
  }

  // If user is authenticated, also check user-based rate limit
  if (uid) {
    const userKey = `${uid}:${eventName}`;
    const userResult = checkRateLimit(userRateLimits, userKey, options);

    if (!userResult.allowed) {
      return userResult;
    }

    // Return the more restrictive limit
    return socketResult.remaining < userResult.remaining
      ? socketResult
      : userResult;
  }

  return socketResult;
}

/**
 * Clear rate limits for a disconnected socket
 */
export function clearSocketRateLimits(socketId: string): void {
  const prefix = `${socketId}:`;
  for (const key of socketRateLimits.keys()) {
    if (key.startsWith(prefix)) {
      socketRateLimits.delete(key);
    }
  }
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Start the rate limit cleanup interval
 */
export function startRateLimitCleanup(intervalMs = 60000): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    cleanupRateLimitStore(socketRateLimits);
    cleanupRateLimitStore(userRateLimits);
    Logger.info(
      `Rate limit cleanup: ${socketRateLimits.size} socket entries, ${userRateLimits.size} user entries`,
    );
  }, intervalMs);

  Logger.info("Rate limit cleanup started");
}

/**
 * Stop the rate limit cleanup interval
 */
export function stopRateLimitCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = undefined;
    Logger.info("Rate limit cleanup stopped");
  }
}

// ============================================================================
// Stats
// ============================================================================

export function getRateLimitStats(): {
  socketEntries: number;
  userEntries: number;
} {
  return {
    socketEntries: socketRateLimits.size,
    userEntries: userRateLimits.size,
  };
}

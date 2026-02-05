import type { Socket, Server } from "socket.io";
import { z } from "zod";
import {
  validateInboundPayload,
  eventRequiresAuth,
  formatZodError,
  SocketErrors,
  type SocketErrorResponse,
} from "@monkeytype/contracts/socket-contract";
import {
  clientToServerEvents,
  type ClientToServerEventName,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type InterServerEvents,
  type SocketData,
} from "@monkeytype/contracts/tribes-socket";
import { checkSocketRateLimit } from "./rate-limiter.js";
import { verifyIdToken, isFirebaseEnabled } from "../auth/index.js";
import Logger from "../utils/logger.js";

// ============================================================================
// Types
// ============================================================================

export type TribesServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type TribesSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type HandlerContext = {
  io: TribesServer;
  socket: TribesSocket;
  uid?: string;
};

type EventHandler<TPayload, TAck> = (
  ctx: HandlerContext,
  payload: TPayload,
) => TAck extends undefined ? void | Promise<void> : TAck | Promise<TAck>;

// ============================================================================
// Socket Handler Wrapper
// ============================================================================

/**
 * Create a wrapped event handler with validation, auth, and rate limiting
 */
export function createHandler<E extends ClientToServerEventName>(
  eventName: E,
  handler: EventHandler<
    z.infer<(typeof clientToServerEvents)[E]["payload"]>,
    z.infer<(typeof clientToServerEvents)[E]["ack"]>
  >,
): (io: TribesServer, socket: TribesSocket) => ClientToServerEvents[E] {
  return (io: TribesServer, socket: TribesSocket) => {
    const eventConfig = clientToServerEvents[eventName];

    // Return a function that matches the event signature
    const wrappedHandler = async (...args: unknown[]): Promise<void> => {
      // Extract payload and callback from args
      const hasCallback =
        eventConfig.ack !== undefined &&
        !(eventConfig.ack instanceof z.ZodUndefined);
      const payload = args[0];
      const callback = hasCallback
        ? (args[1] as ((response: unknown) => void) | undefined)
        : undefined;

      // Helper to send error response
      const sendError = (error: SocketErrorResponse): void => {
        if (callback) {
          callback(error);
        } else {
          socket.emit("system_notification", {
            message: error.error,
            level: 2,
          });
        }
      };

      try {
        // 1. Check if auth is required
        const requiresAuth = eventRequiresAuth(eventName);
        const uid = socket.data.uid;

        if (requiresAuth && isFirebaseEnabled()) {
          if (!uid) {
            Logger.warning(
              `Auth required for ${eventName} but socket ${socket.id} is not authenticated`,
            );
            sendError(SocketErrors.unauthorized());
            return;
          }
        }

        // 2. Check rate limit
        const rateLimitResult = checkSocketRateLimit(socket.id, uid, eventName);
        if (!rateLimitResult.allowed) {
          Logger.warning(
            `Rate limited: ${eventName} for socket ${socket.id} (uid: ${uid ?? "none"})`,
          );
          sendError(SocketErrors.rateLimited());
          return;
        }

        // 3. Validate payload
        const validationResult = validateInboundPayload(eventName, payload);
        if (!validationResult.success) {
          Logger.warning(
            `Validation failed for ${eventName}: ${formatZodError(validationResult.error)}`,
          );
          sendError(SocketErrors.validationError(validationResult.error));
          return;
        }

        // 4. Execute handler
        const ctx: HandlerContext = { io, socket, uid };
        const result = await handler(ctx, validationResult.data);

        // 5. Send response if callback exists
        if (callback && result !== undefined) {
          callback(result);
        }
      } catch (error) {
        Logger.error(`Error in ${eventName} handler: ${String(error)}`);
        sendError(SocketErrors.internalError());
      }
    };

    return wrappedHandler as ClientToServerEvents[E];
  };
}

// ============================================================================
// Socket Authentication
// ============================================================================

/**
 * Authenticate a socket connection using Firebase token
 */
export async function authenticateSocket(
  socket: TribesSocket,
): Promise<boolean> {
  const token = socket.handshake.auth?.["token"] as string | undefined;

  if (!token) {
    // No token provided - socket can still connect but won't be authenticated
    return false;
  }

  if (!isFirebaseEnabled()) {
    // Firebase not configured - skip auth
    return false;
  }

  const result = await verifyIdToken(token);

  if (!result.success) {
    Logger.warning(
      `Socket ${socket.id} authentication failed: ${result.error}`,
    );
    return false;
  }

  // Store uid on socket data
  socket.data.uid = result.token.uid;

  // If name wasn't provided, use name from token
  if (!socket.data.name && result.token.name) {
    socket.data.name = result.token.name.substring(0, 16);
  }

  Logger.info(`Socket ${socket.id} authenticated as ${result.token.uid}`);
  return true;
}

// ============================================================================
// Socket Setup
// ============================================================================

/**
 * Initialize socket data with defaults
 */
export function initializeSocketData(socket: TribesSocket): void {
  const queryName = socket.handshake.query["name"];
  socket.data.name =
    typeof queryName === "string" ? queryName.substring(0, 16) : "Guest";
  socket.data.roomId = undefined;
  socket.data.uid = undefined;
}

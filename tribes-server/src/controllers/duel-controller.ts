// Duel socket event handlers
import type { Server, Socket } from "socket.io";
import * as duelService from "../services/duel-service.js";
import { DUEL_CONFIG } from "../config.js";
import Logger from "../utils/logger.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../types/events.js";

type TribesServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type TribesSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Register all duel-specific socket event handlers.
 * Only registers if DUEL_ENABLED is true.
 */
export function registerDuelHandlers(
  io: TribesServer,
  socket: TribesSocket,
): void {
  // Only register handlers if duel mode is enabled
  if (!DUEL_CONFIG.ENABLED) {
    return;
  }

  Logger.info(`Registering duel handlers for socket ${socket.id}`);

  // ============================================================
  // Register system side (L or R)
  // ============================================================
  socket.on("duel_register_system", (data, callback) => {
    const result = duelService.registerSystem(io, socket, data.side);
    callback(result);
  });

  // ============================================================
  // Authenticate with OTP
  // ============================================================
  socket.on("duel_authenticate", (data, callback) => {
    const result = duelService.authenticate(socket, data.otp);
    callback(result);
  });

  // ============================================================
  // Report practice completion
  // ============================================================
  socket.on("duel_practice_complete", (callback) => {
    const result = duelService.practiceComplete(socket);
    callback(result);
  });

  // ============================================================
  // Join duel lobby
  // ============================================================
  socket.on("duel_join_lobby", (callback) => {
    const result = duelService.joinLobby(io, socket);
    callback(result);
  });

  // ============================================================
  // Time sync for synchronized start
  // ============================================================
  socket.on("duel_time_sync", (data, callback) => {
    callback({
      clientTime: data.clientTime,
      serverTime: Date.now(),
    });
  });

  // ============================================================
  // Handle disconnect - release side and cleanup
  // ============================================================
  socket.on("disconnect", () => {
    duelService.handleDisconnect(io, socket);
  });
}

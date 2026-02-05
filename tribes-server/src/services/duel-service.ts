// Duel business logic - handles duel-specific operations
import type { Server, Socket } from "socket.io";
import { duelStore } from "../stores/duel-store.js";
import { roomStore } from "../stores/room-store.js";
import { validateOtp } from "../utils/duel-otp.js";
import { DUEL_CONFIG, type DuelSide } from "../config.js";
import { getDefaultRoomConfig } from "../types/config.js";
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
 * Response format for duel acknowledgments
 */
export interface DuelAckResponse {
  ok: boolean;
  error?: string;
  data?: unknown;
}

// ============================================================
// System Registration
// ============================================================

/**
 * Register a socket for a duel side (L or R).
 * - Side must be available (not occupied)
 * - Socket must not be already registered
 */
export function registerSystem(
  socket: TribesSocket,
  side: DuelSide,
): DuelAckResponse {
  if (!DUEL_CONFIG.ENABLED) {
    return { ok: false, error: "Duel mode is disabled" };
  }

  // Check if socket already registered
  const existingSide = duelStore.getSideBySocket(socket.id);
  if (existingSide !== undefined) {
    return { ok: false, error: "Already registered to a side" };
  }

  // Attempt registration
  const success = duelStore.registerSide(socket.id, side);
  if (!success) {
    return { ok: false, error: `Side ${side} is already occupied` };
  }

  // Store side in socket data for later reference
  (socket.data as SocketData & { duelSide?: DuelSide }).duelSide = side;

  Logger.info(`Socket ${socket.id} registered as System ${side}`);
  return { ok: true, data: { side } };
}

// ============================================================
// Authentication
// ============================================================

/**
 * Authenticate a socket with OTP.
 * - Socket must be registered to a side first
 * - OTP must be valid (exist in duel-otp.json)
 */
export function authenticate(
  socket: TribesSocket,
  otp: string,
): DuelAckResponse {
  if (!DUEL_CONFIG.ENABLED) {
    return { ok: false, error: "Duel mode is disabled" };
  }

  const side = duelStore.getSideBySocket(socket.id);
  if (side === undefined) {
    return {
      ok: false,
      error: "Not registered to a side. Select L or R first.",
    };
  }

  const participant = duelStore.getParticipantBySocket(socket.id);
  if (participant?.isAuthenticated) {
    return { ok: false, error: "Already authenticated" };
  }

  const validation = validateOtp(otp);
  if (!validation.valid || !validation.username) {
    return { ok: false, error: "Invalid OTP" };
  }

  duelStore.authenticate(socket.id, otp, validation.username);

  // Update socket name for room display
  socket.data.name = validation.username;

  Logger.info(
    `Socket ${socket.id} authenticated as ${validation.username} (Side ${side})`,
  );
  return {
    ok: true,
    data: {
      userId: otp,
      username: validation.username,
      side,
    },
  };
}

// ============================================================
// Practice Completion
// ============================================================

/**
 * Report practice run completion.
 * - Socket must be authenticated
 * - Practice count must not exceed max
 */
export function practiceComplete(socket: TribesSocket): DuelAckResponse {
  if (!DUEL_CONFIG.ENABLED) {
    return { ok: false, error: "Duel mode is disabled" };
  }

  if (!duelStore.isAuthenticated(socket.id)) {
    return { ok: false, error: "Not authenticated" };
  }

  const currentCount = duelStore.getPracticeCount(socket.id);
  if (currentCount >= DUEL_CONFIG.PRACTICE_COUNT) {
    return { ok: false, error: "Practice already completed" };
  }

  const count = duelStore.incrementPractice(socket.id);
  if (count < 0) {
    return { ok: false, error: "Not registered" };
  }

  Logger.info(
    `Socket ${socket.id} completed practice ${count}/${DUEL_CONFIG.PRACTICE_COUNT}`,
  );
  return {
    ok: true,
    data: {
      practiceCount: count,
      practiceRequired: DUEL_CONFIG.PRACTICE_COUNT,
      practiceComplete: count >= DUEL_CONFIG.PRACTICE_COUNT,
    },
  };
}

// ============================================================
// Join Lobby
// ============================================================

/**
 * Join the duel lobby.
 * - Socket must be authenticated
 * - Practice must be complete (PRACTICE_COUNT runs)
 * - Creates room if first participant, joins if second
 */
export function joinLobby(
  io: TribesServer,
  socket: TribesSocket,
): DuelAckResponse {
  if (!DUEL_CONFIG.ENABLED) {
    return { ok: false, error: "Duel mode is disabled" };
  }

  if (!duelStore.isAuthenticated(socket.id)) {
    return { ok: false, error: "Not authenticated" };
  }

  const practiceCount = duelStore.getPracticeCount(socket.id);
  if (practiceCount < DUEL_CONFIG.PRACTICE_COUNT) {
    return {
      ok: false,
      error: `Complete ${DUEL_CONFIG.PRACTICE_COUNT - practiceCount} more practice run(s)`,
    };
  }

  const participant = duelStore.getParticipantBySocket(socket.id);
  if (!participant) {
    return { ok: false, error: "Not registered" };
  }

  // Get or create duel room
  let roomId = duelStore.getActiveRoom();

  if (!roomId) {
    // Create duel-specific room
    const duelRoomConfig = {
      ...getDefaultRoomConfig(),
      ...DUEL_CONFIG.ROOM_CONFIG,
    };

    const room = roomStore.createRoom(
      socket.id,
      participant.username,
      duelRoomConfig,
      true, // Private
      "MKRSPC", // Custom room ID for duel
    );

    // Mark as duel room and set custom name
    (room as unknown as { type: string }).type = "duel";
    room.name = "#MKRSPC";

    roomId = room.id;
    duelStore.setActiveRoom(roomId);
    void socket.join(roomId);
    socket.data.roomId = roomId;

    Logger.info(
      `Created duel room ${roomId} with ${participant.username} as leader`,
    );

    // Emit room_joined to the creator
    socket.emit("room_joined", { room });

    return {
      ok: true,
      data: {
        room,
        waiting: true,
        message: "Waiting for opponent...",
      },
    };
  } else {
    // Join existing duel room
    const existingRoom = roomStore.getRoom(roomId);
    if (!existingRoom) {
      duelStore.clearActiveRoom();
      return { ok: false, error: "Duel room not found, please retry" };
    }

    const result = roomStore.addUserToRoom(
      roomId,
      socket.id,
      participant.username,
    );
    if (!result) {
      return { ok: false, error: "Failed to join duel room" };
    }

    void socket.join(roomId);
    socket.data.roomId = roomId;

    // Emit room_joined to the joiner
    socket.emit("room_joined", { room: result.room });

    // Notify other player
    socket.to(roomId).emit("room_player_joined", { user: result.user });

    // Also emit duel_opponent_joined for duel-specific handling
    const side = duelStore.getSideBySocket(socket.id);
    if (side) {
      socket.to(roomId).emit("duel_opponent_joined", {
        username: participant.username,
        side,
      });
    }

    Logger.info(`${participant.username} joined duel room ${roomId}`);

    // Both players are now in the room - auto-start the duel!
    // Schedule race to start after countdown delay
    const startAt = Date.now() + DUEL_CONFIG.START_DELAY_MS;
    const seed = Math.floor(Math.random() * 1000000);

    Logger.info(
      `Scheduling duel race at ${startAt} (in ${DUEL_CONFIG.START_DELAY_MS}ms), seed: ${seed}`,
    );

    // Emit to all players in the room (including the joiner)
    io.to(roomId).emit("duel_race_scheduled", { startAt, seed });

    return {
      ok: true,
      data: {
        room: result.room,
        waiting: false,
        message: "Both players present. Race starting!",
      },
    };
  }
}

// ============================================================
// Disconnect Handling
// ============================================================

/**
 * Handle socket disconnect.
 * - Releases side
 * - Cleans up room if necessary
 */
export function handleDisconnect(io: TribesServer, socket: TribesSocket): void {
  const side = duelStore.releaseSide(socket.id);
  if (side) {
    Logger.info(`Socket ${socket.id} (Side ${side}) disconnected`);

    // If in duel room, handle room cleanup
    const roomId = duelStore.getActiveRoom();
    if (roomId) {
      const room = roomStore.getRoom(roomId);
      if (room && room.users[socket.id]) {
        // Notify opponent
        socket.to(roomId).emit("duel_opponent_left", { side });

        // Remove from room
        roomStore.removeUserFromRoom(socket.id);
        socket.to(roomId).emit("room_player_left", { userId: socket.id });

        // If room is now empty, clear duel state
        const updatedRoom = roomStore.getRoom(roomId);
        if (!updatedRoom) {
          duelStore.clearActiveRoom();
          duelStore.resetForNextDuel();
          Logger.info(`Duel room ${roomId} deleted, duel state reset`);
        }
      }
    }
  }
}

// ============================================================
// Time Sync
// ============================================================

/**
 * Get current server time for client sync.
 */
export function getTimeSync(): { serverTime: number } {
  return { serverTime: Date.now() };
}

// ============================================================
// Ready Toggle (for duel rooms)
// ============================================================

/**
 * Toggle ready state and check if both are ready to start.
 * Returns true if both participants are now ready.
 */
export function toggleReadyAndCheck(
  io: TribesServer,
  socket: TribesSocket,
): boolean {
  if (!DUEL_CONFIG.ENABLED) return false;

  const side = duelStore.getSideBySocket(socket.id);
  if (!side) return false;

  const newReady = duelStore.toggleReady(socket.id);

  // Emit ready state change
  const roomId = duelStore.getActiveRoom();
  if (roomId) {
    io.to(roomId).emit("room_user_is_ready", {
      userId: socket.id,
      isReady: newReady,
    });
  }

  // Check if both are ready
  return duelStore.areBothReady();
}

// ============================================================
// Status Queries
// ============================================================

/**
 * Get current duel status for HTTP endpoint or debugging.
 */
export function getDuelStatus(): {
  enabled: boolean;
  activeRoom: string | null;
  participants: {
    L: {
      username: string;
      authenticated: boolean;
      practice: number;
      ready: boolean;
    } | null;
    R: {
      username: string;
      authenticated: boolean;
      practice: number;
      ready: boolean;
    } | null;
  };
} {
  const participants = duelStore.getParticipants();

  return {
    enabled: DUEL_CONFIG.ENABLED,
    activeRoom: duelStore.getActiveRoom(),
    participants: {
      L: participants.L
        ? {
            username: participants.L.username,
            authenticated: participants.L.isAuthenticated,
            practice: participants.L.practiceCount,
            ready: participants.L.isReady,
          }
        : null,
      R: participants.R
        ? {
            username: participants.R.username,
            authenticated: participants.R.isAuthenticated,
            practice: participants.R.practiceCount,
            ready: participants.R.isReady,
          }
        : null,
    },
  };
}

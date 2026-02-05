// Duel business logic - handles duel-specific operations
import type { Server, Socket } from "socket.io";
import { duelStore } from "../stores/duel-store.js";
import { roomStore } from "../stores/room-store.js";
import { validateOtp } from "../utils/duel-otp.js";
import type { Room, UserProgress } from "../types/room.js";
import { DUEL_CONFIG, type DuelSide } from "../config.js";
import { getDefaultRoomConfig } from "../types/config.js";
import { timerService, TimerType } from "./timer-service.js";
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

// Disconnect grace period: socketId -> timeout handle
const disconnectGracePeriods: Map<
  string,
  ReturnType<typeof setTimeout>
> = new Map();
const DISCONNECT_GRACE_MS = 10_000; // 10 seconds

// ============================================================
// System Registration
// ============================================================

/**
 * Register a socket for a duel side (L or R).
 * - Side must be available (not occupied)
 * - Socket must not be already registered
 * - If existing socket is dead (disconnected), releases it and re-registers
 */
export function registerSystem(
  io: TribesServer,
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

  // If side is occupied, check if existing socket is dead
  if (!duelStore.isSideAvailable(side)) {
    const existingParticipant = duelStore.getParticipant(side);
    if (existingParticipant) {
      const existingSocket = io.sockets.sockets.get(
        existingParticipant.socketId,
      );
      if (!existingSocket || existingSocket.disconnected) {
        // Dead socket detected — transfer side to new socket
        Logger.info(
          `Dead socket ${existingParticipant.socketId} detected on side ${side}, transferring to ${socket.id}`,
        );
        const transferred = duelStore.transferSide(
          existingParticipant.socketId,
          socket.id,
        );
        if (transferred) {
          (socket.data as SocketData & { duelSide?: DuelSide }).duelSide = side;
          socket.data.name = transferred.username || socket.data.name;

          return {
            ok: true,
            data: {
              side,
              wasAuthenticated: transferred.isAuthenticated,
              practiceCount: transferred.practiceCount,
              username: transferred.username,
              userId: transferred.userId,
            },
          };
        }
      } else {
        // Check if in reconnect grace period
        const gracePeriod = disconnectGracePeriods.get(
          existingParticipant.socketId,
        );
        if (gracePeriod) {
          // Cancel grace period timer and transfer
          clearTimeout(gracePeriod);
          disconnectGracePeriods.delete(existingParticipant.socketId);

          Logger.info(
            `Grace period active for ${existingParticipant.socketId} on side ${side}, transferring to ${socket.id}`,
          );
          const transferred = duelStore.transferSide(
            existingParticipant.socketId,
            socket.id,
          );
          if (transferred) {
            (socket.data as SocketData & { duelSide?: DuelSide }).duelSide =
              side;
            socket.data.name = transferred.username || socket.data.name;

            return {
              ok: true,
              data: {
                side,
                wasAuthenticated: transferred.isAuthenticated,
                practiceCount: transferred.practiceCount,
                username: transferred.username,
                userId: transferred.userId,
              },
            };
          }
        }
        return { ok: false, error: `Side ${side} is already occupied` };
      }
    }
  }

  // Attempt fresh registration
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
    io.to(roomId).emit("duel_race_scheduled", {
      startAt,
      seed,
      raceDuration: DUEL_CONFIG.RACE_DURATION_SECONDS,
    });

    // Initialize the room for race: set seed, reset user states, transition to RACE_ONGOING
    existingRoom.seed = seed;
    existingRoom.maxRaw = 0;
    existingRoom.maxWpm = 0;
    existingRoom.minRaw = Infinity;
    existingRoom.minWpm = Infinity;
    existingRoom.startAt = startAt;

    Object.values(existingRoom.users).forEach((user) => {
      user.isReady = false;
      user.isFinished = false;
      user.isTyping = true;
      user.result = undefined;
      user.progress = undefined;
    });

    // Transition to RACE_ONGOING after the start delay so progress broadcasts work
    const duelRoomId = roomId; // Capture for closure (guaranteed non-null in else branch)
    setTimeout(() => {
      if (existingRoom.state === "LOBBY") {
        existingRoom.state = "RACE_ONGOING";
        io.to(duelRoomId).emit("room_state_changed", {
          state: "RACE_ONGOING",
        });

        // Start progress broadcast interval for duel room
        const PROGRESS_UPDATE_INTERVAL = 100;
        timerService.start(duelRoomId, TimerType.PROGRESS, {
          duration: Infinity,
          interval: PROGRESS_UPDATE_INTERVAL,
          onTick: () => {
            broadcastDuelProgress(io, existingRoom);
          },
          onComplete: (): void => {
            // Progress updates run until manually stopped
          },
        });
      }
    }, DUEL_CONFIG.START_DELAY_MS);

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
 * - Uses a grace period to allow reconnection
 * - If no reconnection within grace period, releases side and cleans up
 */
export function handleDisconnect(io: TribesServer, socket: TribesSocket): void {
  const side = duelStore.getSideBySocket(socket.id);
  if (!side) return;

  Logger.info(
    `Socket ${socket.id} (Side ${side}) disconnected — starting ${DISCONNECT_GRACE_MS}ms grace period`,
  );

  // Notify opponent of temporary disconnect
  const roomId = duelStore.getActiveRoom();
  if (roomId) {
    socket.to(roomId).emit("duel_opponent_left", { side });
  }

  // Start grace period — if the user reconnects within this window,
  // their side is transferred instead of released
  const timer = setTimeout(() => {
    disconnectGracePeriods.delete(socket.id);

    Logger.info(
      `Grace period expired for ${socket.id} (Side ${side}), releasing side`,
    );

    const releasedSide = duelStore.releaseSide(socket.id);
    if (!releasedSide) return;

    // Clean up room
    if (roomId) {
      const room = roomStore.getRoom(roomId);
      if (room && room.users[socket.id]) {
        roomStore.removeUserFromRoom(socket.id);
        io.to(roomId).emit("room_player_left", { userId: socket.id });

        // If room is now empty, clear duel state
        const updatedRoom = roomStore.getRoom(roomId);
        if (!updatedRoom) {
          duelStore.clearActiveRoom();
          duelStore.resetForNextDuel();
          Logger.info(`Duel room ${roomId} deleted, duel state reset`);
        }
      }
    }
  }, DISCONNECT_GRACE_MS);

  disconnectGracePeriods.set(socket.id, timer);
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

// ============================================================
// Progress Broadcasting for Duel Rooms
// ============================================================

function broadcastDuelProgress(io: TribesServer, room: Room): void {
  const users: Record<string, UserProgress> = {};

  let maxRaw = 0;
  let maxWpm = 0;
  let minRaw = Infinity;
  let minWpm = Infinity;

  Object.entries(room.users).forEach(([id, user]) => {
    if (user.progress) {
      users[id] = user.progress;

      if (user.progress.raw > maxRaw) maxRaw = user.progress.raw;
      if (user.progress.wpm > maxWpm) maxWpm = user.progress.wpm;
      if (user.progress.raw < minRaw && user.progress.raw > 0)
        minRaw = user.progress.raw;
      if (user.progress.wpm < minWpm && user.progress.wpm > 0)
        minWpm = user.progress.wpm;
    }
  });

  room.maxRaw = maxRaw;
  room.maxWpm = maxWpm;
  room.minRaw = minRaw === Infinity ? 0 : minRaw;
  room.minWpm = minWpm === Infinity ? 0 : minWpm;

  io.to(room.id).emit("room_progress_update", {
    users,
    roomMaxRaw: room.maxRaw,
    roomMaxWpm: room.maxWpm,
    roomMinRaw: room.minRaw,
    roomMinWpm: room.minWpm,
  });
}

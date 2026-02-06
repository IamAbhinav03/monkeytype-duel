// Duel business logic - handles duel-specific operations
import type { Server, Socket } from "socket.io";
import { duelStore } from "../stores/duel-store.js";
import { roomStore } from "../stores/room-store.js";
import { validateOtp } from "../utils/duel-otp.js";
import type { Room, UserProgress } from "../types/room.js";
import { DUEL_CONFIG, type DuelSide } from "../config.js";
import { getDefaultRoomConfig } from "../types/config.js";
import { timerService, TimerType } from "./timer-service.js";
import { transitionRoom } from "./race-service.js";
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

// Pending duel race start timeout (cleared on disconnect to prevent 1-player races)
let duelStartTimeout: ReturnType<typeof setTimeout> | undefined;
type OtpAttemptState = {
  attempts: number;
  windowStart: number;
  blockedUntil: number;
};
const otpAttemptsBySide: Map<DuelSide, OtpAttemptState> = new Map();
const OTP_ATTEMPT_WINDOW_MS = 60_000;
const OTP_MAX_ATTEMPTS_PER_WINDOW = 8;
const OTP_BLOCK_MS = 120_000;

function clearGracePeriodForSocket(socketId: string): void {
  const timer = disconnectGracePeriods.get(socketId);
  if (!timer) return;
  clearTimeout(timer);
  disconnectGracePeriods.delete(socketId);
}

function clearPendingDuelStart(reason?: string): void {
  if (!duelStartTimeout) return;
  clearTimeout(duelStartTimeout);
  duelStartTimeout = undefined;
  if (reason) {
    Logger.info(`Cleared pending duel race start ${reason}`);
  }
}

function clearOtpRateLimit(side: DuelSide): void {
  otpAttemptsBySide.delete(side);
}

function getOtpBlockRemainingMs(side: DuelSide, now: number): number {
  const state = otpAttemptsBySide.get(side);
  if (!state) return 0;
  if (state.blockedUntil <= now) return 0;
  return state.blockedUntil - now;
}

function getOtpAttemptState(side: DuelSide, now: number): OtpAttemptState {
  const existing = otpAttemptsBySide.get(side);
  if (!existing) {
    const initial: OtpAttemptState = {
      attempts: 0,
      windowStart: now,
      blockedUntil: 0,
    };
    otpAttemptsBySide.set(side, initial);
    return initial;
  }

  if (
    existing.blockedUntil <= now &&
    now - existing.windowStart >= OTP_ATTEMPT_WINDOW_MS
  ) {
    existing.attempts = 0;
    existing.windowStart = now;
    existing.blockedUntil = 0;
  }

  return existing;
}

function recordOtpFailure(side: DuelSide, now: number): number {
  const state = getOtpAttemptState(side, now);

  if (state.blockedUntil > now) {
    return state.blockedUntil - now;
  }

  state.attempts += 1;

  if (state.attempts >= OTP_MAX_ATTEMPTS_PER_WINDOW) {
    state.blockedUntil = now + OTP_BLOCK_MS;
    state.windowStart = now;
    state.attempts = 0;
    return OTP_BLOCK_MS;
  }

  otpAttemptsBySide.set(side, state);
  return 0;
}

function hasValidDuelPairInRoom(room: Room): boolean {
  const left = duelStore.getParticipant("L");
  const right = duelStore.getParticipant("R");

  if (!left || !right) return false;
  if (!left.isAuthenticated || !right.isAuthenticated) return false;
  if (left.practiceCount < DUEL_CONFIG.PRACTICE_COUNT) return false;
  if (right.practiceCount < DUEL_CONFIG.PRACTICE_COUNT) return false;

  if (!room.users[left.socketId] || !room.users[right.socketId]) return false;

  return Object.keys(room.users).length === 2;
}

function scheduleDuelRace(io: TribesServer, room: Room): boolean {
  if (room.type !== "duel") return false;
  if (room.state !== "LOBBY") return false;
  if (!hasValidDuelPairInRoom(room)) return false;
  if (duelStartTimeout) return false;

  const startAt = Date.now() + DUEL_CONFIG.START_DELAY_MS;
  const seed = Math.floor(Math.random() * 1000000);

  Logger.info(
    `Scheduling duel race in room ${room.id} at ${startAt} (in ${DUEL_CONFIG.START_DELAY_MS}ms), seed: ${seed}`,
  );

  // Clear stale WPM from previous race
  duelStore.clearLiveWpm();

  // Initialize the room for race: set seed, reset user states, transition to RACE_ONGOING
  room.seed = seed;
  room.duelResultRecorded = false;
  room.maxRaw = 0;
  room.maxWpm = 0;
  room.minRaw = Infinity;
  room.minWpm = Infinity;
  room.startAt = startAt;

  Object.values(room.users).forEach((user) => {
    user.isReady = false;
    user.isFinished = false;
    user.isTyping = true;
    user.result = undefined;
    user.progress = undefined;
  });

  // Emit to all players in the room (including the joiner)
  io.to(room.id).emit("duel_race_scheduled", {
    startAt,
    seed,
    raceDuration: DUEL_CONFIG.RACE_DURATION_SECONDS,
  });

  // Transition to RACE_ONGOING after the start delay so progress broadcasts work
  const duelRoomId = room.id;
  duelStartTimeout = setTimeout(() => {
    duelStartTimeout = undefined;
    const liveRoom = roomStore.getRoom(duelRoomId);

    if (liveRoom?.type !== "duel") {
      Logger.warning(`Duel race aborted — room ${duelRoomId} no longer exists`);
      return;
    }

    if (liveRoom.state === "LOBBY" && hasValidDuelPairInRoom(liveRoom)) {
      liveRoom.state = "RACE_ONGOING";
      io.to(duelRoomId).emit("room_state_changed", {
        state: "RACE_ONGOING",
      });

      // Start progress broadcast interval for duel room
      const PROGRESS_UPDATE_INTERVAL = 100;
      timerService.start(duelRoomId, TimerType.PROGRESS, {
        duration: Infinity,
        interval: PROGRESS_UPDATE_INTERVAL,
        onTick: () => {
          broadcastDuelProgress(io, liveRoom);
        },
        onComplete: (): void => {
          // Progress updates run until manually stopped
        },
      });
    } else {
      liveRoom.startAt = undefined;
      Logger.warning(
        `Duel race aborted — invalid room state (${liveRoom.state}) or participants for ${duelRoomId}`,
      );
    }
  }, DUEL_CONFIG.START_DELAY_MS);

  return true;
}

function buildJoinLobbyResponse(room: Room): DuelAckResponse {
  return {
    ok: true,
    data: {
      room,
      waiting: room.size < 2,
      message:
        room.size < 2
          ? "Waiting for opponent..."
          : "Both players present. Race starting!",
    },
  };
}

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
    if (existingSide === side) {
      const participant = duelStore.getParticipantBySocket(socket.id);
      return {
        ok: true,
        data: {
          side,
          wasAuthenticated: participant?.isAuthenticated ?? false,
          practiceCount: participant?.practiceCount ?? 0,
          username: participant?.username,
          userId: participant?.userId,
        },
      };
    }

    return {
      ok: false,
      error: `Already registered to side ${existingSide}`,
    };
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
        const oldSocketId = existingParticipant.socketId;
        Logger.info(
          `Dead socket ${oldSocketId} detected on side ${side}, transferring to ${socket.id}`,
        );
        clearGracePeriodForSocket(oldSocketId);
        const transferred = duelStore.transferSide(oldSocketId, socket.id);
        if (transferred) {
          (socket.data as SocketData & { duelSide?: DuelSide }).duelSide = side;
          socket.data.name = transferred.username || socket.data.name;

          const roomTransfer = roomStore.transferUserSocket(
            oldSocketId,
            socket.id,
          );
          if (roomTransfer) {
            // Notify peers the old socket ID is gone (prevents ghost entries)
            socket
              .to(roomTransfer.room.id)
              .emit("room_player_left", { userId: oldSocketId });
            socket.data.roomId = roomTransfer.room.id;
            void socket.join(roomTransfer.room.id);
          }

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
        const oldSocketId = existingParticipant.socketId;
        const gracePeriod = disconnectGracePeriods.get(oldSocketId);
        if (gracePeriod) {
          // Cancel grace period timer and transfer
          clearTimeout(gracePeriod);
          disconnectGracePeriods.delete(oldSocketId);

          Logger.info(
            `Grace period active for ${oldSocketId} on side ${side}, transferring to ${socket.id}`,
          );
          const transferred = duelStore.transferSide(oldSocketId, socket.id);
          if (transferred) {
            (socket.data as SocketData & { duelSide?: DuelSide }).duelSide =
              side;
            socket.data.name = transferred.username || socket.data.name;

            const roomTransfer = roomStore.transferUserSocket(
              oldSocketId,
              socket.id,
            );
            if (roomTransfer) {
              // Notify peers the old socket ID is gone (prevents ghost entries)
              socket
                .to(roomTransfer.room.id)
                .emit("room_player_left", { userId: oldSocketId });
              socket.data.roomId = roomTransfer.room.id;
              void socket.join(roomTransfer.room.id);
            }

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

  const normalizedOtp = otp.trim();
  const participant = duelStore.getParticipantBySocket(socket.id);
  if (participant?.isAuthenticated) {
    if (participant.userId === normalizedOtp) {
      return {
        ok: true,
        data: {
          userId: participant.userId,
          username: participant.username,
          side,
          alreadyAuthenticated: true,
        },
      };
    }

    return {
      ok: false,
      error: "Already authenticated. Reset session before using a new OTP.",
    };
  }

  const now = Date.now();
  const blockRemainingMs = getOtpBlockRemainingMs(side, now);
  if (blockRemainingMs > 0) {
    return {
      ok: false,
      error: `Too many OTP attempts. Try again in ${Math.ceil(blockRemainingMs / 1000)}s.`,
    };
  }

  const validation = validateOtp(normalizedOtp);
  if (!validation.valid || !validation.username) {
    const blockedForMs = recordOtpFailure(side, now);
    if (blockedForMs > 0) {
      return {
        ok: false,
        error: `Too many OTP attempts. Try again in ${Math.ceil(blockedForMs / 1000)}s.`,
      };
    }
    return { ok: false, error: "Invalid OTP" };
  }

  duelStore.authenticate(socket.id, normalizedOtp, validation.username);
  clearOtpRateLimit(side);

  // Update socket name for room display
  socket.data.name = validation.username;

  Logger.info(
    `Socket ${socket.id} authenticated as ${validation.username} (Side ${side})`,
  );
  return {
    ok: true,
    data: {
      userId: normalizedOtp,
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

  const socketRoomId = roomStore.getRoomIdBySocketId(socket.id);
  if (socketRoomId) {
    const socketRoom = roomStore.getRoom(socketRoomId);
    if (socketRoom && socketRoom.type === "duel") {
      socket.data.roomId = socketRoom.id;
      scheduleDuelRace(io, socketRoom);
      return buildJoinLobbyResponse(socketRoom);
    }
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

    return buildJoinLobbyResponse(room);
  } else {
    // Join existing duel room
    const existingRoom = roomStore.getRoom(roomId);
    if (!existingRoom) {
      duelStore.clearActiveRoom();
      return { ok: false, error: "Duel room not found, please retry" };
    }

    if (existingRoom.users[socket.id]) {
      socket.data.roomId = existingRoom.id;
      scheduleDuelRace(io, existingRoom);
      return buildJoinLobbyResponse(existingRoom);
    }

    if (existingRoom.size >= 2) {
      return { ok: false, error: "Duel room is full" };
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

    // Only auto-start if room is in LOBBY state (prevent re-trigger on reconnect)
    if (existingRoom.state !== "LOBBY") {
      return buildJoinLobbyResponse(result.room);
    }

    if (!hasValidDuelPairInRoom(existingRoom)) {
      Logger.warning(
        `Duel race not scheduled for room ${roomId} due to invalid side mapping`,
      );
      return buildJoinLobbyResponse(result.room);
    }

    scheduleDuelRace(io, existingRoom);

    return buildJoinLobbyResponse(result.room);
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

  // Cancel any pending race start — prevents 1-player race after disconnect
  clearPendingDuelStart("due to disconnect");

  // Notify opponent of temporary disconnect
  const roomId = duelStore.getActiveRoom();
  const room = roomId ? roomStore.getRoom(roomId) : undefined;
  if (room?.type === "duel" && room.state === "LOBBY") {
    room.startAt = undefined;
  }
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
    clearOtpRateLimit(releasedSide);

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
        } else if (updatedRoom.state !== "LOBBY") {
          // Room still has users but is stuck in a race state — reset to lobby
          Logger.info(
            `Resetting duel room ${roomId} to LOBBY after grace expiry (was ${updatedRoom.state})`,
          );
          transitionRoom(io, roomId, "LOBBY");
        }
      }
    }
  }, DISCONNECT_GRACE_MS);

  disconnectGracePeriods.set(socket.id, timer);
}

export function resetSession(
  io: TribesServer,
  socket: TribesSocket,
): DuelAckResponse {
  if (!DUEL_CONFIG.ENABLED) {
    return { ok: false, error: "Duel mode is disabled" };
  }

  const side = duelStore.getSideBySocket(socket.id);
  if (side === undefined) {
    return { ok: false, error: "Not registered to a side" };
  }

  clearPendingDuelStart("due to session reset");

  const success = duelStore.deauthenticate(socket.id);
  if (!success) {
    return { ok: false, error: "Failed to reset session" };
  }

  socket.data.name = "Guest";
  const roomId = roomStore.getRoomIdBySocketId(socket.id);
  const room = roomId ? roomStore.getRoom(roomId) : undefined;
  if (room?.type === "duel" && room.state === "LOBBY") {
    room.startAt = undefined;
  }
  if (roomId) {
    const result = roomStore.removeUserFromRoom(socket.id);

    if (result) {
      void socket.leave(result.room.id);
      socket.emit("room_left");
      io.to(result.room.id).emit("room_player_left", { userId: socket.id });

      if (result.wasLeader) {
        const newLeader = Object.values(result.room.users).find(
          (user) => user.isLeader,
        );
        if (newLeader) {
          io.to(result.room.id).emit("room_leader_changed", {
            userId: newLeader.id,
          });
        }
      }
    }

    if (!roomStore.getRoom(roomId)) {
      duelStore.clearActiveRoom();
      duelStore.resetForNextDuel();
    }

    delete socket.data.roomId;
  }

  clearGracePeriodForSocket(socket.id);

  Logger.info(`Reset duel session for socket ${socket.id} (Side ${side})`);
  return { ok: true, data: { side } };
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

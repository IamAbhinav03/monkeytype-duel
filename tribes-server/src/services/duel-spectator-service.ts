import type { Server } from "socket.io";
import { duelStore } from "../stores/duel-store.js";
import { roomStore } from "../stores/room-store.js";
import { DUEL_CONFIG } from "../config.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  DuelSpectatorPayload,
} from "../types/events.js";

type TribesServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export const DUEL_SPECTATORS_ROOM = "duel_spectators";

const DEFAULT_LEFT_NAME = "System Left";
const DEFAULT_RIGHT_NAME = "System Right";

let lastStateSignature: string | undefined;
let lastLeaderboardSignature: string | undefined;

function hasSpectators(io: TribesServer): boolean {
  const room = io.sockets.adapter.rooms.get(DUEL_SPECTATORS_ROOM);
  return room !== undefined && room.size > 0;
}

export function buildDuelSpectatorState(
  io: TribesServer,
): DuelSpectatorPayload {
  const participants = duelStore.getParticipants();
  const liveWpm = duelStore.getLiveWpm();
  const activeRoomId = duelStore.getActiveRoom();
  const room = activeRoomId ? roomStore.getRoom(activeRoomId) : undefined;

  const raceStartAt =
    room?.type === "duel" && room.startAt !== undefined ? room.startAt : null;
  const duelRaceScheduled = room?.type === "duel" && raceStartAt !== null;

  const leftName =
    participants.L?.username && participants.L.username.trim().length > 0
      ? participants.L.username
      : DEFAULT_LEFT_NAME;
  const rightName =
    participants.R?.username && participants.R.username.trim().length > 0
      ? participants.R.username
      : DEFAULT_RIGHT_NAME;

  return {
    serverTime: Date.now(),
    roomId: room?.id ?? null,
    roomState: room?.state ?? null,
    active: duelRaceScheduled,
    race: {
      startAt: raceStartAt,
      duration: DUEL_CONFIG.RACE_DURATION_SECONDS,
    },
    sides: {
      L: participants.L
        ? {
            id: participants.L.userId,
            name: leftName,
            wpm: liveWpm.L?.wpm ?? 0,
            connected:
              io.sockets.sockets.get(participants.L.socketId)?.connected ??
              false,
          }
        : null,
      R: participants.R
        ? {
            id: participants.R.userId,
            name: rightName,
            wpm: liveWpm.R?.wpm ?? 0,
            connected:
              io.sockets.sockets.get(participants.R.socketId)?.connected ??
              false,
          }
        : null,
    },
  };
}

export function getDuelSpectatorSnapshot(io: TribesServer): {
  state: DuelSpectatorPayload;
  leaderboard: ReturnType<typeof duelStore.getLeaderboard>;
} {
  return {
    state: buildDuelSpectatorState(io),
    leaderboard: duelStore.getLeaderboard(),
  };
}

export function emitDuelSpectatorState(io: TribesServer, force = false): void {
  if (!force && !hasSpectators(io)) return;

  const payload = buildDuelSpectatorState(io);
  const signature = JSON.stringify(payload);
  if (!force && signature === lastStateSignature) return;

  lastStateSignature = signature;
  io.to(DUEL_SPECTATORS_ROOM).emit("duel_spectator_state", payload);
}

export function emitDuelLeaderboardSnapshot(
  io: TribesServer,
  force = false,
): void {
  if (!force && !hasSpectators(io)) return;

  const leaderboard = duelStore.getLeaderboard();
  const signature = JSON.stringify(leaderboard);
  if (!force && signature === lastLeaderboardSignature) return;

  lastLeaderboardSignature = signature;
  io.to(DUEL_SPECTATORS_ROOM).emit("duel_leaderboard_snapshot", leaderboard);
}

export function resetDuelSpectatorSignatures(): void {
  lastStateSignature = undefined;
  lastLeaderboardSignature = undefined;
}

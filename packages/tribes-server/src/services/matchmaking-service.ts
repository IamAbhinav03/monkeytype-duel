import type { Server } from "socket.io";
import {
  matchmakingStore,
  MatchmakingQueue,
} from "../stores/matchmaking-store.js";
import { roomStore } from "../stores/room-store.js";
import { getDefaultRoomConfig, getMatchmakingConfig } from "../types/config.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../types/events.js";
import Logger from "../utils/logger.js";

type TribesServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

const MIN_PLAYERS_TO_MATCH = 2;
const MATCHMAKING_CHECK_INTERVAL = 2000;

let matchmakingInterval: NodeJS.Timeout | null = null;

export function startMatchmaking(io: TribesServer): void {
  if (matchmakingInterval) return;

  matchmakingInterval = setInterval(() => {
    checkForMatches(io);
  }, MATCHMAKING_CHECK_INTERVAL);

  Logger.info("Matchmaking service started");
}

export function stopMatchmaking(): void {
  if (matchmakingInterval) {
    clearInterval(matchmakingInterval);
    matchmakingInterval = null;
    Logger.info("Matchmaking service stopped");
  }
}

function checkForMatches(io: TribesServer): void {
  const match = matchmakingStore.findMatch(MIN_PLAYERS_TO_MATCH);
  if (!match) return;

  const { queue, players } = match;
  const leader = players[0];
  if (!leader) return;

  // Create room with queue-specific config
  const config = {
    ...getDefaultRoomConfig(),
    ...getMatchmakingConfig(queue),
  };

  const room = roomStore.createRoom(
    leader.socketId,
    leader.name,
    config,
    false,
  );

  // Move leader socket to room
  const leaderSocket = io.sockets.sockets.get(leader.socketId);
  if (leaderSocket) {
    void leaderSocket.join(room.id);
    leaderSocket.emit("room_joined", { room });
  }

  // Add remaining players
  for (let i = 1; i < players.length; i++) {
    const player = players[i];
    if (!player) continue;

    const result = roomStore.addUserToRoom(
      room.id,
      player.socketId,
      player.name,
    );
    if (!result) continue;

    const playerSocket = io.sockets.sockets.get(player.socketId);
    if (playerSocket) {
      void playerSocket.join(room.id);
      playerSocket.emit("room_joined", { room: result.room });

      // Notify others
      playerSocket
        .to(room.id)
        .emit("room_player_joined", { user: result.user });
    }
  }

  Logger.info(
    `Matchmaking: Created room ${room.id} with ${players.length} players from queue ${MatchmakingQueue[queue]}`,
  );
}

export function joinQueue(
  socketId: string,
  name: string,
  queues: MatchmakingQueue[],
): void {
  matchmakingStore.join(socketId, name, queues);
  Logger.info(
    `Player ${name} joined queues: ${queues.map((q) => MatchmakingQueue[q]).join(", ")}`,
  );
}

export function leaveQueue(socketId: string): void {
  const entry = matchmakingStore.getEntry(socketId);
  if (entry) {
    matchmakingStore.leave(socketId);
    Logger.info(`Player ${entry.name} left matchmaking queue`);
  }
}

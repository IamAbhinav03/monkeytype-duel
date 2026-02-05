import {
  matchmakingStore,
  MATCHMAKING_QUEUE,
  type MatchmakingQueueIndex,
} from "../stores/matchmaking-store.js";
import { roomStore } from "../stores/room-store.js";
import {
  getDefaultRoomConfig,
  getMatchmakingConfig,
} from "@monkeytype/schemas/tribes";
import type { TribesServer } from "../middleware/index.js";
import Logger from "../utils/logger.js";

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

  const queueName =
    queue === MATCHMAKING_QUEUE.TIME_15
      ? "TIME_15"
      : queue === MATCHMAKING_QUEUE.TIME_60
        ? "TIME_60"
        : queue === MATCHMAKING_QUEUE.MEDIUM_QUOTES
          ? "MEDIUM_QUOTES"
          : "LONG_QUOTES";

  Logger.info(
    `Matchmaking: Created room ${room.id} with ${players.length} players from queue ${queueName}`,
  );
}

export function joinQueue(
  socketId: string,
  name: string,
  queues: MatchmakingQueueIndex[],
): void {
  matchmakingStore.join(socketId, name, queues);

  const queueNames = queues
    .map((q) =>
      q === MATCHMAKING_QUEUE.TIME_15
        ? "TIME_15"
        : q === MATCHMAKING_QUEUE.TIME_60
          ? "TIME_60"
          : q === MATCHMAKING_QUEUE.MEDIUM_QUOTES
            ? "MEDIUM_QUOTES"
            : "LONG_QUOTES",
    )
    .join(", ");

  Logger.info(`Player ${name} joined queues: ${queueNames}`);
}

export function leaveQueue(socketId: string): void {
  const entry = matchmakingStore.getEntry(socketId);
  if (entry) {
    matchmakingStore.leave(socketId);
    Logger.info(`Player ${entry.name} left matchmaking queue`);
  }
}

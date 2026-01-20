import type { Server, Socket } from "socket.io";
import { version } from "../version.js";
import { roomStore } from "../stores/room-store.js";
import { matchmakingStore } from "../stores/matchmaking-store.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../types/events.js";
import type { SystemStats } from "../types/room.js";
import Logger from "../utils/logger.js";

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

export function registerSystemHandlers(
  io: TribesServer,
  socket: TribesSocket,
): void {
  socket.on("system_version_check", (data, callback) => {
    const clientVersion = data.version;
    const serverVersion = version;

    // In dev mode, always accept
    if (serverVersion === "dev" || clientVersion === "dev") {
      callback({ status: "ok", version: serverVersion });
      return;
    }

    if (clientVersion === serverVersion) {
      callback({ status: "ok", version: serverVersion });
    } else {
      callback({
        status: `Version mismatch. Client: ${clientVersion}, Server: ${serverVersion}`,
        version: serverVersion,
      });
      Logger.warning(
        `Version mismatch for socket ${socket.id}: client=${clientVersion}, server=${serverVersion}`,
      );
    }
  });

  socket.on("system_stats", (callback) => {
    const roomCount = roomStore.getRoomCount();
    const queueLengths = matchmakingStore.getQueueLengths();

    const stats: SystemStats = {
      pingStart: Date.now(),
      stats: [
        io.engine.clientsCount,
        {
          mm: queueLengths,
          custom: [roomCount.public, roomCount.private],
        },
        queueLengths,
        version,
      ],
    };

    callback(stats);
  });
}

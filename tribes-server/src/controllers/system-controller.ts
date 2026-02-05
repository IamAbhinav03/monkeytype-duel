import { version } from "../version.js";
import { roomStore } from "../stores/room-store.js";
import { matchmakingStore } from "../stores/matchmaking-store.js";
import type { SystemStats } from "@monkeytype/schemas/tribes";
import {
  createHandler,
  type TribesServer,
  type TribesSocket,
} from "../middleware/index.js";
import Logger from "../utils/logger.js";

// Handler for system_version_check
const handleVersionCheck = createHandler(
  "system_version_check",
  (ctx, data) => {
    const clientVersion = data.version;
    const serverVersion = version;

    // In dev mode, always accept
    if (serverVersion === "dev" || clientVersion === "dev") {
      return { status: "ok", version: serverVersion };
    }

    if (clientVersion === serverVersion) {
      return { status: "ok", version: serverVersion };
    }

    Logger.warning(
      `Version mismatch for socket ${ctx.socket.id}: client=${clientVersion}, server=${serverVersion}`,
    );

    return {
      status: `Version mismatch. Client: ${clientVersion}, Server: ${serverVersion}`,
      version: serverVersion,
    };
  },
);

// Handler for system_stats
const handleStats = createHandler("system_stats", (ctx) => {
  const roomCount = roomStore.getRoomCount();
  const queueLengths = matchmakingStore.getQueueLengths();

  const stats: SystemStats = {
    pingStart: Date.now(),
    stats: [
      ctx.io.engine.clientsCount,
      {
        mm: queueLengths,
        custom: [roomCount.public, roomCount.private],
      },
      queueLengths,
      version,
    ],
  };

  return stats;
});

export function registerSystemHandlers(
  io: TribesServer,
  socket: TribesSocket,
): void {
  socket.on("system_version_check", handleVersionCheck(io, socket));
  socket.on("system_stats", handleStats(io, socket));
}

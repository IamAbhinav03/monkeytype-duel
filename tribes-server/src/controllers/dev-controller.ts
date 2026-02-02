import type { Server, Socket } from "socket.io";
import { roomStore } from "../stores/room-store.js";
import { getDefaultRoomConfig } from "../types/config.js";
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

type TribesSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

const DEV_ROOM_ID = "DEVROOM";

export function registerDevHandlers(
  io: TribesServer,
  socket: TribesSocket,
): void {
  socket.on("dev_room", () => {
    const mode = process.env["MODE"];
    if (mode !== "dev" && mode !== "development") {
      Logger.warning(`Attempted to use dev_room in non-dev mode: ${socket.id}`);
      return;
    }

    const name = socket.data.name || "DevUser";
    let room = roomStore.getRoom(DEV_ROOM_ID);

    if (!room) {
      // Create dev room with special ID
      room = roomStore.createRoom(
        socket.id,
        name,
        getDefaultRoomConfig(),
        false,
      );
      Logger.info(`Dev room created by ${name}`);
    } else {
      // Join existing dev room
      const result = roomStore.addUserToRoom(room.id, socket.id, name);
      if (result) {
        room = result.room;
        socket.to(room.id).emit("room_player_joined", { user: result.user });
      }
    }

    void socket.join(room.id);
    socket.emit("room_joined", { room });
  });
}

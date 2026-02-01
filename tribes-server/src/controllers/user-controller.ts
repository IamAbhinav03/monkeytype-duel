import type { Server, Socket } from "socket.io";
import { roomStore } from "../stores/room-store.js";
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

export function registerUserHandlers(
  io: TribesServer,
  socket: TribesSocket,
): void {
  socket.on("user_set_name", (data) => {
    const sanitizedName = data.name
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .substring(0, 16)
      .trim();

    if (sanitizedName.length === 0) {
      return;
    }

    socket.data.name = sanitizedName;

    // Update name in room if in one
    roomStore.updateUserName(socket.id, sanitizedName);

    // Confirm the name update
    socket.emit("user_update_name", { name: sanitizedName });

    Logger.info(`Socket ${socket.id} set name to: ${sanitizedName}`);
  });
}

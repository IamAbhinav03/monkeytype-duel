import { roomStore } from "../stores/room-store.js";
import { getDefaultRoomConfig } from "@monkeytype/schemas/tribes";
import {
  createHandler,
  type TribesServer,
  type TribesSocket,
} from "../middleware/index.js";
import { getConfig } from "../config.js";
import Logger from "../utils/logger.js";

const DEV_ROOM_ID = "DEVROOM";

// Handler for dev_room
const handleDevRoom = createHandler("dev_room", (ctx) => {
  const config = getConfig();
  if (config.mode !== "dev" && config.mode !== "development") {
    Logger.warning(
      `Attempted to use dev_room in non-dev mode: ${ctx.socket.id}`,
    );
    return;
  }

  const name = ctx.socket.data.name || "DevUser";
  let room = roomStore.getRoom(DEV_ROOM_ID);

  if (!room) {
    // Create dev room with special ID
    room = roomStore.createRoom(
      ctx.socket.id,
      name,
      getDefaultRoomConfig(),
      false,
    );
    Logger.info(`Dev room created by ${name}`);
  } else {
    // Join existing dev room
    const result = roomStore.addUserToRoom(room.id, ctx.socket.id, name);
    if (result) {
      room = result.room;
      ctx.socket.to(room.id).emit("room_player_joined", { user: result.user });
    }
  }

  void ctx.socket.join(room.id);
  ctx.socket.emit("room_joined", { room });
});

export function registerDevHandlers(
  io: TribesServer,
  socket: TribesSocket,
): void {
  socket.on("dev_room", handleDevRoom(io, socket));
}

import { roomStore } from "../stores/room-store.js";
import {
  createHandler,
  type TribesServer,
  type TribesSocket,
} from "../middleware/index.js";
import { sanitizeName } from "@monkeytype/contracts/socket-contract";
import Logger from "../utils/logger.js";

// Handler for user_set_name
const handleSetName = createHandler("user_set_name", (ctx, data) => {
  const sanitizedName = sanitizeName(data.name);

  if (sanitizedName.length === 0) {
    return;
  }

  ctx.socket.data.name = sanitizedName;

  // Update name in room if in one
  roomStore.updateUserName(ctx.socket.id, sanitizedName);

  // Confirm the name update
  ctx.socket.emit("user_update_name", { name: sanitizedName });

  Logger.info(`Socket ${ctx.socket.id} set name to: ${sanitizedName}`);
});

export function registerUserHandlers(
  io: TribesServer,
  socket: TribesSocket,
): void {
  socket.on("user_set_name", handleSetName(io, socket));
}

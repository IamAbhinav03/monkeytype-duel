import * as roomService from "../services/room-service.js";
import {
  createHandler,
  type TribesServer,
  type TribesSocket,
} from "../middleware/index.js";
import { clearSocketRateLimits } from "../middleware/rate-limiter.js";
import Logger from "../utils/logger.js";

// Room management handlers
const handleRoomCreate = createHandler("room_create", (ctx, data) => {
  roomService.createRoom(ctx.io, ctx.socket, data.config);
});

const handleRoomJoin = createHandler("room_join", (ctx, data) => {
  return roomService.joinRoom(ctx.io, ctx.socket, data.roomId);
});

const handleRoomLeave = createHandler("room_leave", (ctx) => {
  roomService.leaveRoom(ctx.io, ctx.socket);
});

const handleGetPublicRooms = createHandler(
  "room_get_public_rooms",
  (ctx, data) => {
    return roomService.getPublicRooms(data.page, data.search);
  },
);

// Race management handlers
const handleInitRace = createHandler("room_init_race", (ctx) => {
  roomService.initRace(ctx.io, ctx.socket);
});

const handleReadyUpdate = createHandler("room_ready_update", (ctx) => {
  roomService.toggleReady(ctx.io, ctx.socket);
});

const handleProgressUpdate = createHandler(
  "room_progress_update",
  (ctx, data) => {
    roomService.updateProgress(ctx.io, ctx.socket, data);
  },
);

const handleResult = createHandler("room_result", (ctx, data) => {
  roomService.submitResult(ctx.io, ctx.socket, data.result);
});

const handleBackToLobby = createHandler("room_back_to_lobby", (ctx) => {
  roomService.backToLobby(ctx.io, ctx.socket);
});

// Chat handlers
const handleChatMessage = createHandler("room_chat_message", (ctx, data) => {
  roomService.sendChatMessage(ctx.io, ctx.socket, data.message);
});

const handleChattingUpdate = createHandler(
  "room_chatting_update",
  (ctx, data) => {
    roomService.updateChatting(ctx.io, ctx.socket, data.isChatting);
  },
);

// Room config handlers (leader only)
const handleUpdateConfig = createHandler("room_update_config", (ctx, data) => {
  roomService.updateConfig(ctx.io, ctx.socket, data.config);
});

const handleToggleVisibility = createHandler(
  "room_toggle_visibility",
  (ctx) => {
    roomService.toggleVisibility(ctx.io, ctx.socket);
  },
);

const handleUpdateName = createHandler("room_update_name", (ctx, data) => {
  roomService.updateRoomName(ctx.io, ctx.socket, data.name);
});

// User management handlers (leader only)
const handleBanUser = createHandler("room_ban_user", (ctx, data) => {
  roomService.banUser(ctx.io, ctx.socket, data.userId);
});

const handleGiveLeader = createHandler("room_give_leader", (ctx, data) => {
  roomService.giveLeader(ctx.io, ctx.socket, data.userId);
});

// User status handlers
const handleAfkUpdate = createHandler("room_afk_update", (ctx, data) => {
  roomService.updateAfk(ctx.io, ctx.socket, data.isAfk);
});

export function registerRoomHandlers(
  io: TribesServer,
  socket: TribesSocket,
): void {
  // Room management
  socket.on("room_create", handleRoomCreate(io, socket));
  socket.on("room_join", handleRoomJoin(io, socket));
  socket.on("room_leave", handleRoomLeave(io, socket));
  socket.on("room_get_public_rooms", handleGetPublicRooms(io, socket));

  // Race management
  socket.on("room_init_race", handleInitRace(io, socket));
  socket.on("room_ready_update", handleReadyUpdate(io, socket));
  socket.on("room_progress_update", handleProgressUpdate(io, socket));
  socket.on("room_result", handleResult(io, socket));
  socket.on("room_back_to_lobby", handleBackToLobby(io, socket));

  // Chat
  socket.on("room_chat_message", handleChatMessage(io, socket));
  socket.on("room_chatting_update", handleChattingUpdate(io, socket));

  // Room config (leader only)
  socket.on("room_update_config", handleUpdateConfig(io, socket));
  socket.on("room_toggle_visibility", handleToggleVisibility(io, socket));
  socket.on("room_update_name", handleUpdateName(io, socket));

  // User management (leader only)
  socket.on("room_ban_user", handleBanUser(io, socket));
  socket.on("room_give_leader", handleGiveLeader(io, socket));

  // User status
  socket.on("room_afk_update", handleAfkUpdate(io, socket));

  // Handle disconnect
  socket.on("disconnect", () => {
    roomService.handleDisconnect(io, socket);
    clearSocketRateLimits(socket.id);
    Logger.info(`Socket disconnected: ${socket.id}`);
  });
}

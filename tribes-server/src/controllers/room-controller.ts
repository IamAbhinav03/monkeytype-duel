import type { Server, Socket } from "socket.io";
import * as roomService from "../services/room-service.js";
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

export function registerRoomHandlers(
  io: TribesServer,
  socket: TribesSocket,
): void {
  // Room management
  socket.on("room_create", (data) => {
    roomService.createRoom(io, socket, data.config);
  });

  socket.on("room_join", (data, callback) => {
    const result = roomService.joinRoom(io, socket, data.roomId);
    callback(result);
  });

  socket.on("room_leave", () => {
    roomService.leaveRoom(io, socket);
  });

  socket.on("room_get_public_rooms", (data, callback) => {
    const result = roomService.getPublicRooms(data.page, data.search);
    callback(result);
  });

  // Race management
  socket.on("room_init_race", () => {
    roomService.initRace(io, socket);
  });

  socket.on("room_ready_update", () => {
    roomService.toggleReady(io, socket);
  });

  socket.on("room_progress_update", (data) => {
    roomService.updateProgress(io, socket, data);
  });

  socket.on("room_result", (data) => {
    roomService.submitResult(io, socket, data.result);
  });

  socket.on("room_back_to_lobby", () => {
    roomService.backToLobby(io, socket);
  });

  // Chat
  socket.on("room_chat_message", (data) => {
    roomService.sendChatMessage(io, socket, data.message);
  });

  socket.on("room_chatting_update", (data) => {
    roomService.updateChatting(io, socket, data.isChatting);
  });

  // Room config (leader only)
  socket.on("room_update_config", (data) => {
    roomService.updateConfig(io, socket, data.config);
  });

  socket.on("room_toggle_visibility", () => {
    roomService.toggleVisibility(io, socket);
  });

  socket.on("room_update_name", (data) => {
    roomService.updateRoomName(io, socket, data.name);
  });

  // User management (leader only)
  socket.on("room_ban_user", (data) => {
    roomService.banUser(io, socket, data.userId);
  });

  socket.on("room_give_leader", (data) => {
    roomService.giveLeader(io, socket, data.userId);
  });

  // User status
  socket.on("room_afk_update", (data) => {
    roomService.updateAfk(io, socket, data.isAfk);
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    roomService.handleDisconnect(io, socket);
    Logger.info(`Socket disconnected: ${socket.id}`);
  });
}

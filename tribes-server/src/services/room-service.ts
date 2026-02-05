import { roomStore } from "../stores/room-store.js";
import * as raceService from "./race-service.js";
import type {
  Room,
  UserProgressOut,
  TribeResult,
  RoomConfig,
  PublicRoomData,
} from "@monkeytype/schemas/tribes";
import type { TribesServer, TribesSocket } from "../middleware/index.js";
import { sanitizeMessage } from "@monkeytype/contracts/socket-contract";
import Logger from "../utils/logger.js";

export function createRoom(
  io: TribesServer,
  socket: TribesSocket,
  config: RoomConfig,
): void {
  const name = socket.data.name || "Guest";
  const room = roomStore.createRoom(socket.id, name, config, true);

  void socket.join(room.id);
  socket.emit("room_joined", { room });

  Logger.info(`Room ${room.id} created by ${name}`);
}

export function joinRoom(
  io: TribesServer,
  socket: TribesSocket,
  roomId: string,
): { status?: string; room?: Room } {
  const name = socket.data.name || "Guest";
  const existingRoom = roomStore.getRoom(roomId);

  if (!existingRoom) {
    return { status: "Room not found" };
  }

  if (existingRoom.state !== "LOBBY") {
    return { status: "Room is not in lobby state" };
  }

  if (existingRoom.size >= 8) {
    return { status: "Room is full" };
  }

  const result = roomStore.addUserToRoom(roomId, socket.id, name);
  if (!result) {
    return { status: "Failed to join room" };
  }

  void socket.join(roomId);
  socket.to(roomId).emit("room_player_joined", { user: result.user });

  Logger.info(`${name} joined room ${roomId}`);

  return { room: result.room };
}

export function leaveRoom(io: TribesServer, socket: TribesSocket): void {
  Logger.info(`Leave room requested by socket: ${socket.id}`);

  const result = roomStore.removeUserFromRoom(socket.id);

  if (result) {
    void socket.leave(result.room.id);
    socket.emit("room_left");
    Logger.info(`Emitted room_left to socket: ${socket.id}`);

    io.to(result.room.id).emit("room_player_left", { userId: socket.id });

    if (result.wasLeader) {
      const newLeader = Object.values(result.room.users).find(
        (u) => u.isLeader,
      );
      if (newLeader) {
        io.to(result.room.id).emit("room_leader_changed", {
          userId: newLeader.id,
        });
      }
    }

    Logger.info(`Player ${socket.id} left room ${result.room.id}`);
  } else {
    Logger.warning(`Leave room failed - socket ${socket.id} not in any room`);
  }
}

export function handleDisconnect(io: TribesServer, socket: TribesSocket): void {
  leaveRoom(io, socket);
}

export function getPublicRooms(
  page: number,
  search: string,
): { rooms: PublicRoomData[] } {
  const rooms = roomStore.getPublicRooms(page, search);
  return { rooms };
}

export function toggleReady(io: TribesServer, socket: TribesSocket): void {
  const room = roomStore.getRoomBySocketId(socket.id);
  if (!room) return;

  const user = room.users[socket.id];
  if (!user) return;

  user.isReady = !user.isReady;
  io.to(room.id).emit("room_user_is_ready", {
    userId: socket.id,
    isReady: user.isReady,
  });
}

export function updateAfk(
  io: TribesServer,
  socket: TribesSocket,
  isAfk: boolean,
): void {
  const room = roomStore.getRoomBySocketId(socket.id);
  if (!room) return;

  const user = room.users[socket.id];
  if (!user) return;

  user.isAfk = isAfk;
  io.to(room.id).emit("room_user_afk_update", { userId: socket.id, isAfk });
}

export function updateChatting(
  io: TribesServer,
  socket: TribesSocket,
  isChatting: boolean,
): void {
  const room = roomStore.getRoomBySocketId(socket.id);
  if (!room) return;

  io.to(room.id).emit("room_chatting_changed", {
    userId: socket.id,
    isChatting,
  });
}

export function sendChatMessage(
  io: TribesServer,
  socket: TribesSocket,
  message: string,
): void {
  const room = roomStore.getRoomBySocketId(socket.id);
  if (!room) return;

  const user = room.users[socket.id];
  if (!user) return;

  // Use shared sanitization function
  const sanitized = sanitizeMessage(message, 200);

  io.to(room.id).emit("room_chat_message", {
    message: sanitized,
    from: user,
    isSystem: false,
  });
}

export function sendSystemMessage(
  io: TribesServer,
  roomId: string,
  message: string,
): void {
  io.to(roomId).emit("room_chat_message", {
    message,
    isSystem: true,
  });
}

export function updateConfig(
  io: TribesServer,
  socket: TribesSocket,
  config: RoomConfig,
): void {
  const room = roomStore.getRoomBySocketId(socket.id);
  if (!room) return;

  if (!roomStore.isLeader(socket.id)) return;

  roomStore.updateRoomConfig(room.id, config);
  io.to(room.id).emit("room_config_changed", { config });
}

export function toggleVisibility(io: TribesServer, socket: TribesSocket): void {
  const room = roomStore.getRoomBySocketId(socket.id);
  if (!room) return;

  if (!roomStore.isLeader(socket.id)) return;

  const isPrivate = roomStore.toggleRoomVisibility(room.id);
  if (isPrivate !== undefined) {
    io.to(room.id).emit("room_visibility_changed", { isPrivate });
  }
}

export function updateRoomName(
  io: TribesServer,
  socket: TribesSocket,
  name: string,
): void {
  const room = roomStore.getRoomBySocketId(socket.id);
  if (!room) return;

  if (!roomStore.isLeader(socket.id)) return;

  const sanitized = sanitizeMessage(name, 50);
  roomStore.updateRoomName(room.id, sanitized);
  io.to(room.id).emit("room_name_changed", { name: sanitized });
}

export function banUser(
  io: TribesServer,
  socket: TribesSocket,
  userId: string,
): void {
  const room = roomStore.getRoomBySocketId(socket.id);
  if (!room) return;

  if (!roomStore.isLeader(socket.id)) return;

  const targetSocket = io.sockets.sockets.get(userId);
  if (targetSocket) {
    const playerName = room.users[userId]?.name ?? "A player";
    roomStore.removeUserFromRoom(userId);
    void targetSocket.leave(room.id);
    targetSocket.emit("room_left");
    io.to(room.id).emit("room_player_left", { userId });

    sendSystemMessage(io, room.id, `${playerName} was kicked`);
  }
}

export function giveLeader(
  io: TribesServer,
  socket: TribesSocket,
  userId: string,
): void {
  const room = roomStore.getRoomBySocketId(socket.id);
  if (!room) return;

  if (!roomStore.isLeader(socket.id)) return;

  if (roomStore.setLeader(room.id, userId)) {
    io.to(room.id).emit("room_leader_changed", { userId });
  }
}

export function initRace(io: TribesServer, socket: TribesSocket): void {
  raceService.initRace(io, socket.id);
}

export function updateProgress(
  io: TribesServer,
  socket: TribesSocket,
  progress: UserProgressOut,
): void {
  raceService.updateProgress(io, socket.id, progress);
}

export function submitResult(
  io: TribesServer,
  socket: TribesSocket,
  result: TribeResult,
): void {
  raceService.submitResult(io, socket.id, result);
}

export function backToLobby(io: TribesServer, socket: TribesSocket): void {
  raceService.backToLobby(io, socket.id);
}

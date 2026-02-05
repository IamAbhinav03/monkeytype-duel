import type {
  Room,
  TribeUser,
  PublicRoomData,
  RoomState,
  RoomConfig,
} from "@monkeytype/schemas/tribes";
import { getDefaultRoomConfig } from "@monkeytype/schemas/tribes";
import {
  generateRoomId,
  releaseRoomId,
  generateSeed,
} from "../utils/id-generator.js";

// ============================================================================
// Room Store
// ============================================================================

class RoomStore {
  private rooms: Map<string, Room> = new Map();
  private socketToRoom: Map<string, string> = new Map();

  // Room TTL for cleanup (30 minutes of inactivity)
  private roomLastActivity: Map<string, number> = new Map();
  private readonly ROOM_TTL_MS = 30 * 60 * 1000;

  createRoom(
    leaderId: string,
    leaderName: string,
    config?: Partial<RoomConfig>,
    isPrivate = true,
  ): Room {
    const roomId = generateRoomId();
    const room: Room = {
      id: roomId,
      state: "LOBBY",
      users: {
        [leaderId]: {
          id: leaderId,
          name: leaderName,
          isLeader: true,
          isReady: false,
          isAfk: false,
          isChatting: false,
          points: 0,
        },
      },
      size: 1,
      updateRate: 100,
      isPrivate,
      name: `${leaderName}'s Room`,
      config: { ...getDefaultRoomConfig(), ...config },
      maxRaw: 0,
      maxWpm: 0,
      minRaw: 0,
      minWpm: 0,
      seed: generateSeed(),
    };

    this.rooms.set(roomId, room);
    this.socketToRoom.set(leaderId, roomId);
    this.roomLastActivity.set(roomId, Date.now());
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRoomBySocketId(socketId: string): Room | undefined {
    const roomId = this.socketToRoom.get(socketId);
    return roomId !== undefined ? this.rooms.get(roomId) : undefined;
  }

  getRoomIdBySocketId(socketId: string): string | undefined {
    return this.socketToRoom.get(socketId);
  }

  addUserToRoom(
    roomId: string,
    socketId: string,
    name: string,
  ): { room: Room; user: TribeUser } | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const user: TribeUser = {
      id: socketId,
      name,
      isLeader: false,
      isReady: false,
      isAfk: false,
      isChatting: false,
      points: 0,
    };

    room.users[socketId] = user;
    room.size = Object.keys(room.users).length;
    this.socketToRoom.set(socketId, roomId);
    this.touchRoom(roomId);

    return { room, user };
  }

  removeUserFromRoom(
    socketId: string,
  ): { room: Room; wasLeader: boolean } | undefined {
    const roomId = this.socketToRoom.get(socketId);
    if (roomId === undefined) return undefined;

    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const user = room.users[socketId];
    const wasLeader = user?.isLeader ?? false;

    const { [socketId]: _, ...remainingUsers } = room.users;
    room.users = remainingUsers;
    room.size = Object.keys(room.users).length;
    this.socketToRoom.delete(socketId);

    // If room is empty, delete it
    if (room.size === 0) {
      this.deleteRoom(roomId);
      return undefined;
    }

    // If leader left, assign new leader
    if (wasLeader) {
      const newLeaderId = Object.keys(room.users)[0];
      if (newLeaderId !== undefined && room.users[newLeaderId] !== undefined) {
        room.users[newLeaderId].isLeader = true;
      }
    }

    this.touchRoom(roomId);
    return { room, wasLeader };
  }

  deleteRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      Object.keys(room.users).forEach((socketId) => {
        this.socketToRoom.delete(socketId);
      });
      this.rooms.delete(roomId);
      this.roomLastActivity.delete(roomId);
      releaseRoomId(roomId);
    }
  }

  updateRoomState(roomId: string, state: RoomState): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.state = state;
      this.touchRoom(roomId);
    }
  }

  updateRoomConfig(roomId: string, config: RoomConfig): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.config = config;
      this.touchRoom(roomId);
    }
  }

  updateRoomName(roomId: string, name: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.name = name;
      this.touchRoom(roomId);
    }
  }

  toggleRoomVisibility(roomId: string): boolean | undefined {
    const room = this.rooms.get(roomId);
    if (room) {
      room.isPrivate = !room.isPrivate;
      this.touchRoom(roomId);
      return room.isPrivate;
    }
    return undefined;
  }

  getUser(socketId: string): TribeUser | undefined {
    const room = this.getRoomBySocketId(socketId);
    return room?.users[socketId];
  }

  updateUserName(socketId: string, name: string): void {
    const user = this.getUser(socketId);
    if (user) {
      user.name = name;
    }
  }

  isLeader(socketId: string): boolean {
    const user = this.getUser(socketId);
    return user?.isLeader ?? false;
  }

  setLeader(roomId: string, newLeaderId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || !room.users[newLeaderId]) return false;

    // Remove leader status from current leader
    Object.values(room.users).forEach((user) => {
      user.isLeader = false;
    });

    // Set new leader
    room.users[newLeaderId].isLeader = true;
    this.touchRoom(roomId);
    return true;
  }

  getPublicRooms(page: number, search: string): PublicRoomData[] {
    const pageSize = 20;
    const rooms = Array.from(this.rooms.values())
      .filter((r) => !r.isPrivate && r.state === "LOBBY")
      .filter(
        (r) => !search || r.name.toLowerCase().includes(search.toLowerCase()),
      )
      .map((r) => ({
        id: r.id,
        size: r.size,
        name: r.name,
        state: r.state,
        config: r.config,
      }));

    return rooms.slice(page * pageSize, (page + 1) * pageSize);
  }

  getRoomCount(): { total: number; public: number; private: number } {
    let publicCount = 0;
    let privateCount = 0;

    this.rooms.forEach((room) => {
      if (room.isPrivate) {
        privateCount++;
      } else {
        publicCount++;
      }
    });

    return {
      total: this.rooms.size,
      public: publicCount,
      private: privateCount,
    };
  }

  getConnectedCount(): number {
    return this.socketToRoom.size;
  }

  resetRoomForNextRace(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.seed = generateSeed();
    room.maxRaw = 0;
    room.maxWpm = 0;
    room.minRaw = 0;
    room.minWpm = 0;

    Object.values(room.users).forEach((user) => {
      user.isReady = false;
      user.isFinished = false;
      user.isTyping = false;
      user.result = undefined;
      user.progress = undefined;
    });

    this.touchRoom(roomId);
  }

  // ============================================================================
  // TTL Management
  // ============================================================================

  private touchRoom(roomId: string): void {
    this.roomLastActivity.set(roomId, Date.now());
  }

  /**
   * Clean up rooms that have been inactive for too long
   */
  cleanupInactiveRooms(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [roomId, lastActivity] of this.roomLastActivity.entries()) {
      if (now - lastActivity > this.ROOM_TTL_MS) {
        this.deleteRoom(roomId);
        cleaned++;
      }
    }

    return cleaned;
  }
}

export const roomStore = new RoomStore();

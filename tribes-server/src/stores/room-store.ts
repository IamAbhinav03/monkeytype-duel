import type { Room, User, PublicRoomData, RoomState } from "../types/room.js";
import type { RoomConfig } from "../types/config.js";
import { getDefaultRoomConfig } from "../types/config.js";
import {
  generateRoomId,
  releaseRoomId,
  generateSeed,
} from "../utils/id-generator.js";

class RoomStore {
  private rooms: Map<string, Room> = new Map();
  private socketToRoom: Map<string, string> = new Map();

  createRoom(
    leaderId: string,
    leaderName: string,
    config?: Partial<RoomConfig>,
    isPrivate = true,
    customRoomId?: string,
  ): Room {
    const roomId = customRoomId ?? generateRoomId();
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
      minRaw: Infinity,
      minWpm: Infinity,
      seed: generateSeed(),
    };

    this.rooms.set(roomId, room);
    this.socketToRoom.set(leaderId, roomId);
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

  transferUserSocket(
    oldSocketId: string,
    newSocketId: string,
  ): { room: Room; user: User } | undefined {
    const roomId = this.socketToRoom.get(oldSocketId);
    if (roomId === undefined) return undefined;

    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const existingUser = room.users[oldSocketId];
    if (!existingUser) return undefined;

    const transferredUser: User = {
      ...existingUser,
      id: newSocketId,
    };

    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete room.users[oldSocketId];
    room.users[newSocketId] = transferredUser;

    this.socketToRoom.delete(oldSocketId);
    this.socketToRoom.set(newSocketId, roomId);

    return {
      room,
      user: transferredUser,
    };
  }

  addUserToRoom(
    roomId: string,
    socketId: string,
    name: string,
  ): { room: Room; user: User } | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const user: User = {
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

    return { room, wasLeader };
  }

  deleteRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      Object.keys(room.users).forEach((socketId) => {
        this.socketToRoom.delete(socketId);
      });
      this.rooms.delete(roomId);
      releaseRoomId(roomId);
    }
  }

  updateRoomState(roomId: string, state: RoomState): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.state = state;
    }
  }

  updateRoomConfig(roomId: string, config: RoomConfig): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.config = config;
    }
  }

  updateRoomName(roomId: string, name: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.name = name;
    }
  }

  toggleRoomVisibility(roomId: string): boolean | undefined {
    const room = this.rooms.get(roomId);
    if (room) {
      room.isPrivate = !room.isPrivate;
      return room.isPrivate;
    }
    return undefined;
  }

  getUser(socketId: string): User | undefined {
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
    room.startAt = undefined;
    room.duelResultRecorded = false;
    room.maxRaw = 0;
    room.maxWpm = 0;
    room.minRaw = Infinity;
    room.minWpm = Infinity;

    Object.values(room.users).forEach((user) => {
      user.isReady = false;
      user.isFinished = false;
      user.isTyping = false;
      user.result = undefined;
      user.progress = undefined;
    });
  }
}

export const roomStore = new RoomStore();

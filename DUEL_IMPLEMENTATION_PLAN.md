# Duel Flow Implementation Plan

## Executive Summary

This plan implements a dedicated duel system on the `/tribe` route. The flow replaces the existing tribe menu with a streamlined duel experience: System L/R selection -> OTP authentication -> two 30s practice runs -> lobby (ready) -> synchronized 30s race -> results.

---

## Architecture Overview

### Flow Diagram
```
[User visits /tribe]
        |
        v
+-------------------+
| System Selection  |  <-- Persists in localStorage (survives F5)
| (L or R)          |
+-------------------+
        |
        v (socket connects)
+-------------------+
| OTP Page          |  <-- Returns here on refresh
| (Enter ID)        |
+-------------------+
        |
        v (OTP validated against duel-otp.json)
+-------------------+
| Practice Run 1    |  <-- 30 seconds
| (30s timed test)  |
+-------------------+
        |
        v
+-------------------+
| Practice Run 2    |  <-- 30 seconds
| (30s timed test)  |
+-------------------+
        |
        v (both L and R completed practice)
+-------------------+
| Duel Lobby        |  <-- Wait for opponent, Ready up
| (Wait & Ready)    |
+-------------------+
        |
        v (both ready - server schedules startAt)
+-------------------+
| Synchronized Race |  <-- 30 seconds, same words via seed
| (30s duel)        |
+-------------------+
        |
        v
+-------------------+
| Results           |  <-- WPM comparison, persisted to history
| (View & Refresh)  |
+-------------------+
        | (refresh goes to OTP page)
        v
[OTP Page]
```

---

## Part 1: Backend (tribes-server)

### 1.1 New Files to Create

#### `tribes-server/src/config.ts`
```typescript
// Duel-specific configuration
export const DUEL_CONFIG = {
  ENABLED: process.env["DUEL_ENABLED"] === "true",
  OTP_PATH: process.env["DUEL_OTP_PATH"] ?? "./duel-otp.json",
  START_DELAY_MS: parseInt(process.env["DUEL_START_DELAY_MS"] ?? "5000", 10),
  PRACTICE_COUNT: 2,
  RACE_DURATION_SECONDS: 30,
  ROOM_CONFIG: {
    mode: "time" as const,
    time: 30,
    language: "english",
    difficulty: "normal" as const,
    punctuation: false,
    numbers: false,
  },
} as const;
```

#### `tribes-server/duel-otp.json` (example)
```json
{
  "abc123": "PlayerOne",
  "def456": "PlayerTwo",
  "ghi789": "PlayerThree"
}
```

#### `tribes-server/src/utils/duel-otp.ts`
```typescript
// OTP loader and validator
import { z } from "zod";
import { readFileSync } from "fs";
import { DUEL_CONFIG } from "../config.js";
import Logger from "./logger.js";

const OtpMapSchema = z.record(z.string(), z.string());

let otpMap: Record<string, string> = {};

export function loadOtpMap(): void {
  if (!DUEL_CONFIG.ENABLED) {
    Logger.info("Duel mode disabled, skipping OTP load");
    return;
  }

  try {
    const raw = readFileSync(DUEL_CONFIG.OTP_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const result = OtpMapSchema.safeParse(parsed);

    if (!result.success) {
      throw new Error(`Invalid OTP schema: ${result.error.message}`);
    }

    otpMap = result.data;
    Logger.success(`Loaded ${Object.keys(otpMap).length} OTP entries`);
  } catch (error) {
    Logger.error(`Failed to load OTP map: ${error}`);
    process.exit(1);  // Fail fast on invalid config
  }
}

export function validateOtp(otp: string): { valid: boolean; username?: string } {
  const username = otpMap[otp];
  return username ? { valid: true, username } : { valid: false };
}

export function getOtpMap(): Readonly<Record<string, string>> {
  return otpMap;
}
```

#### `tribes-server/src/stores/duel-store.ts`
```typescript
// Duel state management
import type { UserProgress, Result } from "../types/room.js";

export type DuelSide = "L" | "R";

export interface DuelParticipant {
  socketId: string;
  userId: string;      // OTP ID
  username: string;
  practiceCount: number;
  isReady: boolean;
  isAuthenticated: boolean;
}

export interface DuelLiveWpm {
  side: DuelSide;
  wpm: number;
  raw: number;
  acc: number;
  progress: number;
  updatedAt: number;
}

export interface DuelResult {
  timestamp: number;
  L: { wpm: number; raw: number; acc: number; consistency: number };
  R: { wpm: number; raw: number; acc: number; consistency: number };
  winner: DuelSide | "TIE";
}

class DuelStore {
  private sides: Map<DuelSide, DuelParticipant | null> = new Map([
    ["L", null],
    ["R", null],
  ]);

  private socketToSide: Map<string, DuelSide> = new Map();
  private activeRoomId: string | null = null;
  private liveWpm: Map<DuelSide, DuelLiveWpm> = new Map();
  private results: DuelResult[] = [];

  // --- Side Management ---
  registerSide(socketId: string, side: DuelSide): boolean {
    if (this.sides.get(side) !== null) {
      return false;  // Side already occupied
    }

    this.sides.set(side, {
      socketId,
      userId: "",
      username: "",
      practiceCount: 0,
      isReady: false,
      isAuthenticated: false,
    });
    this.socketToSide.set(socketId, side);
    return true;
  }

  releaseSide(socketId: string): DuelSide | undefined {
    const side = this.socketToSide.get(socketId);
    if (side === undefined) return undefined;

    this.sides.set(side, null);
    this.socketToSide.delete(socketId);
    this.liveWpm.delete(side);
    return side;
  }

  getSideBySocket(socketId: string): DuelSide | undefined {
    return this.socketToSide.get(socketId);
  }

  getParticipant(side: DuelSide): DuelParticipant | null {
    return this.sides.get(side) ?? null;
  }

  getParticipantBySocket(socketId: string): DuelParticipant | null {
    const side = this.socketToSide.get(socketId);
    return side ? this.sides.get(side) ?? null : null;
  }

  isSideAvailable(side: DuelSide): boolean {
    return this.sides.get(side) === null;
  }

  // --- Authentication ---
  authenticate(socketId: string, userId: string, username: string): boolean {
    const participant = this.getParticipantBySocket(socketId);
    if (!participant) return false;

    participant.userId = userId;
    participant.username = username;
    participant.isAuthenticated = true;
    return true;
  }

  isAuthenticated(socketId: string): boolean {
    return this.getParticipantBySocket(socketId)?.isAuthenticated ?? false;
  }

  // --- Practice Tracking ---
  incrementPractice(socketId: string): number {
    const participant = this.getParticipantBySocket(socketId);
    if (!participant) return -1;

    participant.practiceCount += 1;
    return participant.practiceCount;
  }

  getPracticeCount(socketId: string): number {
    return this.getParticipantBySocket(socketId)?.practiceCount ?? 0;
  }

  // --- Ready State ---
  setReady(socketId: string, ready: boolean): void {
    const participant = this.getParticipantBySocket(socketId);
    if (participant) {
      participant.isReady = ready;
    }
  }

  areBothReady(): boolean {
    const L = this.sides.get("L");
    const R = this.sides.get("R");
    return (L?.isReady ?? false) && (R?.isReady ?? false);
  }

  areBothInLobby(): boolean {
    const L = this.sides.get("L");
    const R = this.sides.get("R");
    return (
      L !== null && R !== null &&
      L.isAuthenticated && R.isAuthenticated &&
      L.practiceCount >= 2 && R.practiceCount >= 2
    );
  }

  // --- Room Management ---
  setActiveRoom(roomId: string): void {
    this.activeRoomId = roomId;
  }

  getActiveRoom(): string | null {
    return this.activeRoomId;
  }

  clearActiveRoom(): void {
    this.activeRoomId = null;
  }

  // --- Live WPM ---
  updateLiveWpm(socketId: string, data: Omit<DuelLiveWpm, "side" | "updatedAt">): void {
    const side = this.socketToSide.get(socketId);
    if (!side) return;

    this.liveWpm.set(side, {
      ...data,
      side,
      updatedAt: Date.now(),
    });
  }

  getLiveWpm(): Record<DuelSide, DuelLiveWpm | null> {
    return {
      L: this.liveWpm.get("L") ?? null,
      R: this.liveWpm.get("R") ?? null,
    };
  }

  // --- Results ---
  addResult(
    L: { wpm: number; raw: number; acc: number; consistency: number },
    R: { wpm: number; raw: number; acc: number; consistency: number }
  ): void {
    const winner: DuelSide | "TIE" =
      L.wpm > R.wpm ? "L" : R.wpm > L.wpm ? "R" : "TIE";

    this.results.push({
      timestamp: Date.now(),
      L,
      R,
      winner,
    });
  }

  getResults(): DuelResult[] {
    return [...this.results];
  }

  // --- Reset ---
  resetForNextDuel(): void {
    // Keep sides registered but reset ready state and practice
    for (const [side, participant] of this.sides) {
      if (participant) {
        participant.isReady = false;
        // Don't reset practiceCount - they stay authenticated
      }
    }
    this.liveWpm.clear();
  }

  fullReset(): void {
    this.sides.set("L", null);
    this.sides.set("R", null);
    this.socketToSide.clear();
    this.activeRoomId = null;
    this.liveWpm.clear();
    // Keep results for history
  }
}

export const duelStore = new DuelStore();
```

#### `tribes-server/src/services/duel-service.ts`
```typescript
// Duel business logic
import type { Server, Socket } from "socket.io";
import { duelStore, DuelSide } from "../stores/duel-store.js";
import { roomStore } from "../stores/room-store.js";
import { validateOtp } from "../utils/duel-otp.js";
import { DUEL_CONFIG } from "../config.js";
import { transitionRoom } from "./race-service.js";
import { getDefaultRoomConfig } from "../types/config.js";
import Logger from "../utils/logger.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../types/events.js";

type TribesServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type TribesSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export interface DuelAckResponse {
  ok: boolean;
  error?: string;
  data?: unknown;
}

// --- Registration ---
export function registerSystem(
  socket: TribesSocket,
  side: DuelSide
): DuelAckResponse {
  if (!DUEL_CONFIG.ENABLED) {
    return { ok: false, error: "Duel mode is disabled" };
  }

  // Check if socket already registered
  const existingSide = duelStore.getSideBySocket(socket.id);
  if (existingSide !== undefined) {
    return { ok: false, error: "Already registered to a side" };
  }

  // Attempt registration
  const success = duelStore.registerSide(socket.id, side);
  if (!success) {
    return { ok: false, error: `Side ${side} is already occupied` };
  }

  // Store side in socket data for later reference
  (socket.data as SocketData & { duelSide?: DuelSide }).duelSide = side;

  Logger.info(`Socket ${socket.id} registered as System ${side}`);
  return { ok: true, data: { side } };
}

// --- Authentication ---
export function authenticate(
  socket: TribesSocket,
  otp: string
): DuelAckResponse {
  if (!DUEL_CONFIG.ENABLED) {
    return { ok: false, error: "Duel mode is disabled" };
  }

  const side = duelStore.getSideBySocket(socket.id);
  if (side === undefined) {
    return { ok: false, error: "Not registered to a side. Select L or R first." };
  }

  const participant = duelStore.getParticipantBySocket(socket.id);
  if (participant?.isAuthenticated) {
    return { ok: false, error: "Already authenticated" };
  }

  const validation = validateOtp(otp);
  if (!validation.valid || !validation.username) {
    return { ok: false, error: "Invalid OTP" };
  }

  duelStore.authenticate(socket.id, otp, validation.username);

  // Update socket name for room display
  socket.data.name = validation.username;

  Logger.info(`Socket ${socket.id} authenticated as ${validation.username} (Side ${side})`);
  return {
    ok: true,
    data: {
      userId: otp,
      username: validation.username,
      side
    }
  };
}

// --- Practice Completion ---
export function practiceComplete(
  socket: TribesSocket
): DuelAckResponse {
  if (!DUEL_CONFIG.ENABLED) {
    return { ok: false, error: "Duel mode is disabled" };
  }

  if (!duelStore.isAuthenticated(socket.id)) {
    return { ok: false, error: "Not authenticated" };
  }

  const count = duelStore.incrementPractice(socket.id);
  if (count < 0) {
    return { ok: false, error: "Not registered" };
  }

  if (count > DUEL_CONFIG.PRACTICE_COUNT) {
    return { ok: false, error: "Practice already completed" };
  }

  Logger.info(`Socket ${socket.id} completed practice ${count}/${DUEL_CONFIG.PRACTICE_COUNT}`);
  return {
    ok: true,
    data: {
      practiceCount: count,
      practiceRequired: DUEL_CONFIG.PRACTICE_COUNT,
      practiceComplete: count >= DUEL_CONFIG.PRACTICE_COUNT
    }
  };
}

// --- Join Lobby ---
export function joinLobby(
  io: TribesServer,
  socket: TribesSocket
): DuelAckResponse {
  if (!DUEL_CONFIG.ENABLED) {
    return { ok: false, error: "Duel mode is disabled" };
  }

  if (!duelStore.isAuthenticated(socket.id)) {
    return { ok: false, error: "Not authenticated" };
  }

  const practiceCount = duelStore.getPracticeCount(socket.id);
  if (practiceCount < DUEL_CONFIG.PRACTICE_COUNT) {
    return {
      ok: false,
      error: `Complete ${DUEL_CONFIG.PRACTICE_COUNT - practiceCount} more practice run(s)`
    };
  }

  const participant = duelStore.getParticipantBySocket(socket.id);
  if (!participant) {
    return { ok: false, error: "Not registered" };
  }

  // Get or create duel room
  let roomId = duelStore.getActiveRoom();

  if (!roomId) {
    // Create duel-specific room
    const duelRoomConfig = {
      ...getDefaultRoomConfig(),
      ...DUEL_CONFIG.ROOM_CONFIG,
    };

    const room = roomStore.createRoom(
      socket.id,
      participant.username,
      duelRoomConfig,
      true  // Private
    );

    roomId = room.id;
    duelStore.setActiveRoom(roomId);
    socket.join(roomId);
    socket.data.roomId = roomId;

    Logger.info(`Created duel room ${roomId} with ${participant.username} as leader`);

    return {
      ok: true,
      data: {
        room,
        waiting: true,
        message: "Waiting for opponent..."
      }
    };
  } else {
    // Join existing duel room
    const result = roomStore.addUserToRoom(roomId, socket.id, participant.username);
    if (!result) {
      return { ok: false, error: "Failed to join duel room" };
    }

    socket.join(roomId);
    socket.data.roomId = roomId;

    // Notify other player
    socket.to(roomId).emit("room_player_joined", { user: result.user });

    Logger.info(`${participant.username} joined duel room ${roomId}`);

    return {
      ok: true,
      data: {
        room: result.room,
        waiting: false,
        message: "Both players present. Ready up!"
      }
    };
  }
}

// --- Handle Disconnect ---
export function handleDisconnect(
  io: TribesServer,
  socket: TribesSocket
): void {
  const side = duelStore.releaseSide(socket.id);
  if (side) {
    Logger.info(`Socket ${socket.id} (Side ${side}) disconnected`);

    // If in duel room, handle room cleanup
    const roomId = duelStore.getActiveRoom();
    if (roomId) {
      const room = roomStore.getRoomBySocketId(socket.id);
      if (room) {
        roomStore.removeUserFromRoom(socket.id);
        socket.to(roomId).emit("room_player_left", { userId: socket.id });

        // If room empty, clear duel state
        if (!roomStore.getRoom(roomId)) {
          duelStore.clearActiveRoom();
          duelStore.resetForNextDuel();
        }
      }
    }
  }
}

// --- Time Sync ---
export function getTimeSync(): { serverTime: number } {
  return { serverTime: Date.now() };
}
```

#### `tribes-server/src/controllers/duel-controller.ts`
```typescript
// Duel socket event handlers
import type { Server, Socket } from "socket.io";
import * as duelService from "../services/duel-service.js";
import { duelStore } from "../stores/duel-store.js";
import { DUEL_CONFIG } from "../config.js";
import Logger from "../utils/logger.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../types/events.js";

type TribesServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type TribesSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function registerDuelHandlers(
  io: TribesServer,
  socket: TribesSocket
): void {
  // Only register handlers if duel mode enabled
  if (!DUEL_CONFIG.ENABLED) {
    return;
  }

  // Register system side (L or R)
  socket.on("duel_register_system", (data, callback) => {
    const result = duelService.registerSystem(socket, data.side);
    callback(result);
  });

  // Authenticate with OTP
  socket.on("duel_authenticate", (data, callback) => {
    const result = duelService.authenticate(socket, data.otp);
    callback(result);
  });

  // Report practice completion
  socket.on("duel_practice_complete", (callback) => {
    const result = duelService.practiceComplete(socket);
    callback(result);
  });

  // Join duel lobby
  socket.on("duel_join_lobby", (callback) => {
    const result = duelService.joinLobby(io, socket);
    callback(result);
  });

  // Time sync
  socket.on("duel_time_sync", (data, callback) => {
    callback({
      clientTime: data.clientTime,
      serverTime: Date.now(),
    });
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    duelService.handleDisconnect(io, socket);
  });
}
```

### 1.2 Modify Existing Files

#### `tribes-server/src/types/events.ts` - Add duel events
```typescript
// Add to ClientToServerEvents:
  // Duel events
  duel_register_system: (
    data: { side: "L" | "R" },
    callback: (response: DuelAckResponse) => void
  ) => void;
  duel_authenticate: (
    data: { otp: string },
    callback: (response: DuelAckResponse) => void
  ) => void;
  duel_practice_complete: (
    callback: (response: DuelAckResponse) => void
  ) => void;
  duel_join_lobby: (
    callback: (response: DuelAckResponse) => void
  ) => void;
  duel_time_sync: (
    data: { clientTime: number },
    callback: (response: { clientTime: number; serverTime: number }) => void
  ) => void;

// Add to ServerToClientEvents:
  duel_opponent_joined: (data: { username: string; side: "L" | "R" }) => void;
  duel_opponent_left: (data: { side: "L" | "R" }) => void;
  duel_race_scheduled: (data: { startAt: number; seed: number }) => void;

// Add type:
export interface DuelAckResponse {
  ok: boolean;
  error?: string;
  data?: unknown;
}
```

#### `tribes-server/src/types/room.ts` - Extend Room type
```typescript
// Add to Room type:
export type Room = {
  // ... existing fields
  type?: "standard" | "duel";
  startAt?: number;  // For synchronized start
};
```

#### `tribes-server/src/app.ts` - Register duel handlers and HTTP endpoints
```typescript
import { registerDuelHandlers } from "./controllers/duel-controller.js";
import { loadOtpMap } from "./utils/duel-otp.js";
import { duelStore } from "./stores/duel-store.js";
import { DUEL_CONFIG } from "./config.js";

// Load OTP map at startup
loadOtpMap();

// Add HTTP endpoints for live WPM and results
app.get("/duel/live-wpm", (_req, res) => {
  if (!DUEL_CONFIG.ENABLED) {
    return res.status(404).json({ error: "Duel mode disabled" });
  }
  res.json(duelStore.getLiveWpm());
});

app.get("/duel/results", (_req, res) => {
  if (!DUEL_CONFIG.ENABLED) {
    return res.status(404).json({ error: "Duel mode disabled" });
  }
  res.json(duelStore.getResults());
});

// In io.on("connection"): Add duel handler registration
io.on("connection", (socket) => {
  // ... existing code
  registerDuelHandlers(io, socket);
});
```

#### `tribes-server/src/services/race-service.ts` - Add duel-specific logic
```typescript
// Modify handleRaceInit to handle startAt for duel rooms:
function handleRaceInit(io: TribesServer, room: Room): void {
  room.seed = generateSeed();
  // ... existing code

  // For duel rooms, calculate startAt
  if (room.type === "duel") {
    room.startAt = Date.now() + DUEL_CONFIG.START_DELAY_MS;
  }

  io.to(room.id).emit("room_init_race", {
    seed: room.seed,
    startAt: room.startAt  // New field
  });

  // ... rest of function
}

// Modify updateProgress to update duel live WPM:
export function updateProgress(/*...*/) {
  // ... existing code

  // Update duel store if in duel room
  const room = roomStore.getRoomBySocketId(socketId);
  if (room?.type === "duel") {
    duelStore.updateLiveWpm(socketId, {
      wpm: progress.wpm,
      raw: progress.raw,
      acc: progress.acc,
      progress: progress.progress,
    });
  }
}

// Modify submitResult to record duel results:
export function submitResult(/*...*/) {
  // ... existing code

  // Check if both duel participants finished
  const room = roomStore.getRoomBySocketId(socketId);
  if (room?.type === "duel") {
    const L = duelStore.getParticipant("L");
    const R = duelStore.getParticipant("R");

    if (L && R) {
      const LUser = room.users[L.socketId];
      const RUser = room.users[R.socketId];

      if (LUser?.result && RUser?.result) {
        duelStore.addResult(
          {
            wpm: LUser.result.wpm,
            raw: LUser.result.raw,
            acc: LUser.result.acc,
            consistency: LUser.result.consistency,
          },
          {
            wpm: RUser.result.wpm,
            raw: RUser.result.raw,
            acc: RUser.result.acc,
            consistency: RUser.result.consistency,
          }
        );
      }
    }
  }
}
```

---

## Part 2: Frontend

### 2.1 New Files to Create

#### `frontend/src/ts/tribe/duel/duel-state.ts`
```typescript
// Duel client state management
import { LocalStorageWithSchema } from "../../utils/local-storage-with-schema";
import { z } from "zod";

// --- Types ---
export type DuelSide = "L" | "R";

export type DuelFlowState =
  | "SYSTEM_SELECT"   // Choosing L or R
  | "OTP"             // Entering OTP
  | "PRACTICE_1"      // First practice
  | "PRACTICE_2"      // Second practice
  | "LOBBY"           // Waiting in lobby
  | "RACING"          // Active duel
  | "RESULTS";        // Viewing results

// --- LocalStorage for side persistence ---
const sideLS = new LocalStorageWithSchema({
  key: "duel-side",
  schema: z.enum(["L", "R"]),
  fallback: undefined,
});

// --- State ---
let flowState: DuelFlowState = "SYSTEM_SELECT";
let side: DuelSide | undefined = sideLS.get() ?? undefined;
let userId: string | undefined = undefined;
let username: string | undefined = undefined;
let practiceCount = 0;
let isAuthenticated = false;

// --- Getters ---
export function getFlowState(): DuelFlowState {
  return flowState;
}

export function getSide(): DuelSide | undefined {
  return side;
}

export function getUserId(): string | undefined {
  return userId;
}

export function getUsername(): string | undefined {
  return username;
}

export function getPracticeCount(): number {
  return practiceCount;
}

export function isUserAuthenticated(): boolean {
  return isAuthenticated;
}

// --- Setters ---
export function setFlowState(state: DuelFlowState): void {
  flowState = state;
}

export function setSide(newSide: DuelSide | undefined): void {
  side = newSide;
  if (newSide) {
    sideLS.set(newSide);
  } else {
    localStorage.removeItem("duel-side");
  }
}

export function setAuthenticated(
  newUserId: string,
  newUsername: string
): void {
  userId = newUserId;
  username = newUsername;
  isAuthenticated = true;
}

export function incrementPractice(): number {
  practiceCount += 1;
  return practiceCount;
}

// --- Reset ---
export function clearSide(): void {
  setSide(undefined);
  flowState = "SYSTEM_SELECT";
}

export function resetToOtp(): void {
  userId = undefined;
  username = undefined;
  practiceCount = 0;
  isAuthenticated = false;
  flowState = "OTP";
}

export function fullReset(): void {
  clearSide();
  resetToOtp();
}

// --- Initialization ---
export function initDuelState(): DuelFlowState {
  // Check persisted side
  const persistedSide = sideLS.get();

  if (persistedSide) {
    side = persistedSide;
    // Side persists, but auth doesn't - go to OTP
    flowState = "OTP";
  } else {
    flowState = "SYSTEM_SELECT";
  }

  return flowState;
}
```

#### `frontend/src/ts/tribe/duel/duel-time-sync.ts`
```typescript
// Time synchronization with server
import TribeSocket from "../tribe-socket";

let serverOffset = 0;  // serverTime - clientTime
let synced = false;

export async function sync(): Promise<void> {
  const samples: number[] = [];

  // Take 3 samples for median
  for (let i = 0; i < 3; i++) {
    const clientSend = Date.now();

    const response = await new Promise<{ clientTime: number; serverTime: number }>((resolve) => {
      TribeSocket.out.duel.timeSync(clientSend, resolve);
    });

    const clientReceive = Date.now();
    const roundTrip = clientReceive - clientSend;
    const estimatedServerTime = response.serverTime + roundTrip / 2;
    const offset = estimatedServerTime - clientReceive;

    samples.push(offset);

    // Small delay between samples
    await new Promise((r) => setTimeout(r, 50));
  }

  // Use median
  samples.sort((a, b) => a - b);
  serverOffset = samples[1] ?? 0;
  synced = true;

  console.log("Time sync complete. Server offset:", serverOffset, "ms");
}

export function getServerNow(): number {
  return Date.now() + serverOffset;
}

export function getOffset(): number {
  return serverOffset;
}

export function isSynced(): boolean {
  return synced;
}

export function scheduleAt(
  serverTimestamp: number,
  callback: () => void
): NodeJS.Timeout {
  const clientTime = serverTimestamp - serverOffset;
  const delay = clientTime - Date.now();

  if (delay <= 0) {
    // Already past, execute immediately
    callback();
    return setTimeout(() => {}, 0);
  }

  return setTimeout(callback, delay);
}
```

#### `frontend/src/ts/tribe/duel/duel-flow.ts`
```typescript
// Main duel flow controller
import * as DuelState from "./duel-state";
import * as DuelTimeSync from "./duel-time-sync";
import * as TribePages from "../tribe-pages";
import * as TribePageSystem from "../pages/tribe-page-system";
import * as TribePageOtp from "../pages/tribe-page-otp";
import * as TribePagePreloader from "../pages/tribe-page-preloader";
import * as TestLogic from "../../test/test-logic";
import * as TimerEvent from "../../observables/timer-event";
import * as NavigationEvent from "../../observables/navigation-event";
import * as Random from "../../utils/random";
import * as Notifications from "../../elements/notifications";
import TribeSocket from "../tribe-socket";
import Config, * as UpdateConfig from "../../config";

let practiceCompleteResolve: (() => void) | null = null;
let currentStartAt: number | undefined = undefined;
let startScheduled = false;

// --- Initialize Flow ---
export async function init(): Promise<void> {
  const initialState = DuelState.initDuelState();

  if (initialState === "SYSTEM_SELECT") {
    await TribePages.change("system");
    return;
  }

  // Has side, connect and go to OTP
  TribePagePreloader.updateText("Connecting...");
  await TribePages.change("preloader");

  // Connect socket
  TribeSocket.connect();
}

// --- Socket Connection Success ---
export async function onConnected(): Promise<void> {
  const side = DuelState.getSide();

  if (!side) {
    // No side selected, show system page
    await TribePages.change("system");
    return;
  }

  // Register our side
  const result = await TribeSocket.out.duel.registerSystem(side);

  if (!result.ok) {
    if (result.error?.includes("occupied")) {
      // Side taken, let user pick again
      DuelState.clearSide();
      Notifications.add(`System ${side} is occupied. Choose again.`, -1);
      await TribePages.change("system");
    } else {
      Notifications.add(result.error ?? "Registration failed", -1);
    }
    return;
  }

  // Sync time
  await DuelTimeSync.sync();

  // Go to OTP page
  DuelState.setFlowState("OTP");
  await TribePages.change("otp");
}

// --- System Selection ---
export async function selectSide(side: DuelState.DuelSide): Promise<void> {
  DuelState.setSide(side);

  TribePagePreloader.updateText("Connecting...");
  await TribePages.change("preloader");

  TribeSocket.connect();
}

// --- OTP Authentication ---
export async function authenticate(otp: string): Promise<boolean> {
  const result = await TribeSocket.out.duel.authenticate(otp);

  if (!result.ok) {
    Notifications.add(result.error ?? "Authentication failed", -1);
    return false;
  }

  const data = result.data as { userId: string; username: string; side: string };
  DuelState.setAuthenticated(data.userId, data.username);

  Notifications.add(`Welcome, ${data.username}!`, 1);

  // Start practice flow
  await startPractice();
  return true;
}

// --- Change Side ---
export async function changeSide(): Promise<void> {
  TribeSocket.disconnect();
  DuelState.clearSide();
  await TribePages.change("system");
}

// --- Practice Flow ---
async function startPractice(): Promise<void> {
  const practiceNum = DuelState.getPracticeCount() + 1;
  DuelState.setFlowState(practiceNum === 1 ? "PRACTICE_1" : "PRACTICE_2");

  Notifications.add(`Practice ${practiceNum}/2 - 30 second test`, 1, { duration: 3 });

  // Set config for practice
  await setPracticeConfig();

  // Navigate to test
  NavigationEvent.dispatch("/", {
    tribeOverride: true,
    force: true,
  });

  // Wait for test completion
  await waitForTestComplete();

  DuelState.incrementPractice();

  if (DuelState.getPracticeCount() < 2) {
    // Start second practice
    await startPractice();
  } else {
    // Report practice complete to server
    const result = await TribeSocket.out.duel.practiceComplete();

    if (!result.ok) {
      Notifications.add(result.error ?? "Failed to report practice completion", -1);
      return;
    }

    // Join lobby
    await joinLobby();
  }
}

async function setPracticeConfig(): Promise<void> {
  // Set 30 second timed test config
  UpdateConfig.setConfig("mode", "time", { nosave: true, tribeOverride: true });
  UpdateConfig.setConfig("time", 30, { nosave: true, tribeOverride: true });
  UpdateConfig.setConfig("language", "english", { nosave: true, tribeOverride: true });
  UpdateConfig.setConfig("punctuation", false, { nosave: true, tribeOverride: true });
  UpdateConfig.setConfig("numbers", false, { nosave: true, tribeOverride: true });
}

function waitForTestComplete(): Promise<void> {
  return new Promise((resolve) => {
    practiceCompleteResolve = resolve;
  });
}

// Called from test completion hook
export function onTestComplete(): void {
  if (practiceCompleteResolve) {
    practiceCompleteResolve();
    practiceCompleteResolve = null;
  }
}

// --- Lobby ---
async function joinLobby(): Promise<void> {
  DuelState.setFlowState("LOBBY");

  const result = await TribeSocket.out.duel.joinLobby();

  if (!result.ok) {
    Notifications.add(result.error ?? "Failed to join lobby", -1);
    return;
  }

  // Navigate to lobby
  NavigationEvent.dispatch("/tribe", { tribeOverride: true });
  await TribePages.change("lobby");

  const data = result.data as { room: unknown; waiting: boolean; message: string };
  Notifications.add(data.message, 1);
}

// --- Race Start (from socket) ---
export function onRaceInit(seed: number, startAt?: number): void {
  DuelState.setFlowState("RACING");

  // Set seed for deterministic words
  Random.setSeed(seed.toString());

  // Store startAt for synchronized start
  currentStartAt = startAt;
  startScheduled = false;

  // Navigate to test
  NavigationEvent.dispatch("/", {
    tribeOverride: true,
    force: true,
  });
}

export function onRaceStarted(): void {
  if (currentStartAt && !startScheduled) {
    // Schedule start at exact time
    DuelTimeSync.scheduleAt(currentStartAt, () => {
      TimerEvent.dispatch("start");
    });
    startScheduled = true;
  } else {
    // Fallback: start immediately
    setTimeout(() => {
      TimerEvent.dispatch("start");
    }, 500);
  }
}

// --- Results ---
export function onRaceComplete(): void {
  DuelState.setFlowState("RESULTS");
}

// --- Navigation Guard ---
export function canNavigate(path: string): boolean {
  const state = DuelState.getFlowState();

  // During practice, only allow test page
  if (state === "PRACTICE_1" || state === "PRACTICE_2") {
    return path === "/";
  }

  // During racing, only allow test page
  if (state === "RACING") {
    return path === "/";
  }

  // During lobby, only allow tribe page
  if (state === "LOBBY") {
    return path === "/tribe";
  }

  // System select and OTP: only tribe page
  if (state === "SYSTEM_SELECT" || state === "OTP") {
    return path === "/tribe";
  }

  // Results: allow tribe (for refresh to OTP)
  if (state === "RESULTS") {
    return path === "/tribe";
  }

  return true;
}
```

#### `frontend/src/ts/tribe/pages/tribe-page-system.ts`
```typescript
// System L/R selection page
import { qsr, qsa } from "../../utils/dom";
import * as DuelFlow from "../duel/duel-flow";
import type { DuelSide } from "../duel/duel-state";

export function init(): void {
  const buttons = qsa<HTMLButtonElement>(".pageTribe .tribePage.system .sideButton");

  buttons.forEach((btn) => {
    btn.on("click", () => {
      const side = btn.getAttribute("data-side") as DuelSide;
      if (side === "L" || side === "R") {
        void DuelFlow.selectSide(side);
      }
    });
  });
}

export function reset(): void {
  // Nothing to reset
}
```

#### `frontend/src/ts/tribe/pages/tribe-page-otp.ts`
```typescript
// OTP authentication page
import { qsr } from "../../utils/dom";
import * as DuelFlow from "../duel/duel-flow";
import * as DuelState from "../duel/duel-state";

export function init(): void {
  const form = qsr<HTMLFormElement>(".pageTribe .tribePage.otp form");
  const input = qsr<HTMLInputElement>(".pageTribe .tribePage.otp input[name='otp']");
  const changeSideBtn = qsr<HTMLButtonElement>(".pageTribe .tribePage.otp .changeSideButton");
  const sideLabel = qsr(".pageTribe .tribePage.otp .currentSide");

  // Update side label
  const side = DuelState.getSide();
  sideLabel?.setText(`System ${side ?? "?"}`);

  // Form submit
  form?.on("submit", async (e: Event) => {
    e.preventDefault();
    const otp = input?.getValue()?.trim() ?? "";

    if (!otp) {
      return;
    }

    const success = await DuelFlow.authenticate(otp);
    if (success) {
      input?.setValue("");
    }
  });

  // Change side button
  changeSideBtn?.on("click", () => {
    void DuelFlow.changeSide();
  });
}

export function reset(): void {
  const input = qsr<HTMLInputElement>(".pageTribe .tribePage.otp input[name='otp']");
  input?.setValue("");
}

export function updateSideLabel(): void {
  const side = DuelState.getSide();
  const sideLabel = qsr(".pageTribe .tribePage.otp .currentSide");
  sideLabel?.setText(`System ${side ?? "?"}`);
}
```

### 2.2 HTML Additions (`frontend/src/html/pages/tribe.html`)

Add after the preloader div and before the menu div:

```html
  <!-- System L/R Selection Page -->
  <div class="tribePage system hidden">
    <div class="systemSelect">
      <div class="title">Select Your System</div>
      <div class="subtitle">Choose which side you are controlling</div>
      <div class="buttons">
        <button class="sideButton" data-side="L">
          <div class="icon"><i class="fas fa-arrow-left"></i></div>
          <div class="text">System L</div>
          <div class="subtext">Left Side</div>
        </button>
        <button class="sideButton" data-side="R">
          <div class="icon"><i class="fas fa-arrow-right"></i></div>
          <div class="text">System R</div>
          <div class="subtext">Right Side</div>
        </button>
      </div>
    </div>
  </div>

  <!-- OTP Authentication Page -->
  <div class="tribePage otp hidden">
    <div class="otpAuth">
      <div class="title">Enter Your ID</div>
      <div class="currentSide">System ?</div>
      <form>
        <div class="inputGroup">
          <input type="text" name="otp" placeholder="Enter your ID" autocomplete="off" />
          <button type="submit" class="submitButton">
            <i class="fas fa-sign-in-alt"></i>
            Authenticate
          </button>
        </div>
      </form>
      <button class="changeSideButton textButton">
        <i class="fas fa-exchange-alt"></i>
        Change Side
      </button>
    </div>
  </div>
```

### 2.3 SCSS Additions (`frontend/src/styles/tribe.scss`)

```scss
.pageTribe {
  // ... existing styles

  .tribePage {
    // ... existing styles

    &.system {
      display: grid;
      place-items: center;
      height: 100%;

      .systemSelect {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2rem;

        .title {
          font-size: 2rem;
          color: var(--main-color);
        }

        .subtitle {
          color: var(--sub-color);
        }

        .buttons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;

          .sideButton {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
            padding: 3rem 4rem;
            background: var(--sub-alt-color);
            border: 2px solid transparent;
            border-radius: 0.5rem;
            cursor: pointer;
            transition: all 0.2s ease;

            &:hover {
              border-color: var(--main-color);
              background: var(--bg-color);
            }

            .icon {
              font-size: 3rem;
              color: var(--main-color);
            }

            .text {
              font-size: 1.5rem;
              color: var(--text-color);
            }

            .subtext {
              color: var(--sub-color);
            }
          }
        }
      }
    }

    &.otp {
      display: grid;
      place-items: center;
      height: 100%;

      .otpAuth {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.5rem;

        .title {
          font-size: 2rem;
          color: var(--main-color);
        }

        .currentSide {
          color: var(--sub-color);
          font-size: 1.2rem;
          padding: 0.5rem 1rem;
          background: var(--sub-alt-color);
          border-radius: 0.25rem;
        }

        form {
          .inputGroup {
            display: flex;
            gap: 1rem;

            input {
              padding: 1rem 1.5rem;
              font-size: 1.2rem;
              background: var(--sub-alt-color);
              border: 2px solid transparent;
              border-radius: 0.25rem;
              color: var(--text-color);
              outline: none;

              &:focus {
                border-color: var(--main-color);
              }
            }

            .submitButton {
              display: flex;
              align-items: center;
              gap: 0.5rem;
              padding: 1rem 1.5rem;
              background: var(--main-color);
              color: var(--bg-color);
              border: none;
              border-radius: 0.25rem;
              cursor: pointer;
              font-size: 1rem;

              &:hover {
                filter: brightness(1.1);
              }
            }
          }
        }

        .changeSideButton {
          color: var(--sub-color);
          font-size: 0.9rem;

          &:hover {
            color: var(--main-color);
          }
        }
      }
    }
  }
}
```

### 2.4 Socket Extensions (`frontend/src/ts/tribe/tribe-socket/`)

#### `frontend/src/ts/tribe/tribe-socket/duel.ts`
```typescript
// Duel-specific socket events
import Socket from "./socket";
import type { DuelSide } from "../duel/duel-state";

interface DuelAckResponse {
  ok: boolean;
  error?: string;
  data?: unknown;
}

export const out = {
  registerSystem: (side: DuelSide): Promise<DuelAckResponse> => {
    return new Promise((resolve) => {
      Socket.emit("duel_register_system", { side }, resolve);
    });
  },

  authenticate: (otp: string): Promise<DuelAckResponse> => {
    return new Promise((resolve) => {
      Socket.emit("duel_authenticate", { otp }, resolve);
    });
  },

  practiceComplete: (): Promise<DuelAckResponse> => {
    return new Promise((resolve) => {
      Socket.emit("duel_practice_complete", resolve);
    });
  },

  joinLobby: (): Promise<DuelAckResponse> => {
    return new Promise((resolve) => {
      Socket.emit("duel_join_lobby", resolve);
    });
  },

  timeSync: (
    clientTime: number,
    callback: (response: { clientTime: number; serverTime: number }) => void
  ): void => {
    Socket.emit("duel_time_sync", { clientTime }, callback);
  },
};

export const in_ = {
  opponentJoined: (callback: (data: { username: string; side: DuelSide }) => void): void => {
    Socket.on("duel_opponent_joined", callback);
  },

  opponentLeft: (callback: (data: { side: DuelSide }) => void): void => {
    Socket.on("duel_opponent_left", callback);
  },

  raceScheduled: (callback: (data: { startAt: number; seed: number }) => void): void => {
    Socket.on("duel_race_scheduled", callback);
  },
};
```

#### Update `frontend/src/ts/tribe/tribe-socket/index.ts`
```typescript
// Add duel routes
import * as DuelRoutes from "./duel";

export default {
  // ... existing
  duel: {
    out: DuelRoutes.out,
    in: DuelRoutes.in_,
  },
};
```

### 2.5 Modify `frontend/src/ts/tribe/tribe.ts`

```typescript
// At top, add imports:
import * as DuelFlow from "./duel/duel-flow";
import * as DuelState from "./duel/duel-state";

// Replace init() function:
export async function init(): Promise<void> {
  if (getTribeMode() === "disabled") return;

  // Initialize duel flow instead of standard tribe menu
  await DuelFlow.init();
}

// In connect() function, add duel handling:
async function connect(): Promise<void> {
  TribeState.setSocketId(TribeSocket.getId());

  // Check for duel mode
  const duelSide = DuelState.getSide();
  if (duelSide) {
    await DuelFlow.onConnected();
    return;
  }

  // ... rest of existing connect logic (for non-duel mode if needed)
}

// Modify TribeSocket.in.room.initRace handler:
TribeSocket.in.room.initRace((data) => {
  // Pass startAt to duel flow for synchronized start
  DuelFlow.onRaceInit(data.seed, (data as { seed: number; startAt?: number }).startAt);

  // ... rest of existing logic
});

// Modify TribeSocket.in.room.raceStarted handler:
TribeSocket.in.room.raceStarted(() => {
  // Use duel flow for synchronized start
  DuelFlow.onRaceStarted();

  // ... rest of existing logic (without the setTimeout start)
});
```

### 2.6 Test Completion Hook

#### `frontend/src/ts/observables/test-completed-event.ts`
```typescript
// Test completion observable
type SubscribeFunction = () => void;

const subscribers: SubscribeFunction[] = [];

export function subscribe(fn: SubscribeFunction): void {
  subscribers.push(fn);
}

export function dispatch(): void {
  subscribers.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error("Test completed event subscriber threw an error");
      console.error(e);
    }
  });
}
```

#### In `frontend/src/ts/test/test-logic.ts`, add at end of finish():
```typescript
import * as TestCompletedEvent from "../observables/test-completed-event";
import * as DuelFlow from "../tribe/duel/duel-flow";

// At the end of finish() function:
TestCompletedEvent.dispatch();
DuelFlow.onTestComplete();
```

### 2.7 Navigation Guard

#### `frontend/src/ts/tribe/duel/duel-guard.ts`
```typescript
// Navigation guard for duel flow
import * as NavigationEvent from "../../observables/navigation-event";
import * as DuelFlow from "./duel-flow";
import * as Notifications from "../../elements/notifications";

export function init(): void {
  NavigationEvent.subscribe((url, options) => {
    // Skip if tribeOverride is set
    if (options?.tribeOverride) {
      return;
    }

    if (!DuelFlow.canNavigate(url)) {
      // Block navigation
      Notifications.add("Cannot navigate during duel flow", 0);
      // The NavigationEvent handler should respect this somehow
      // We may need to modify the navigation system to support blocking
    }
  });
}
```

---

## Part 3: Testing Plan

### 3.1 Backend Unit Tests

#### `tribes-server/src/tests/duel-store.test.ts`
```typescript
describe("DuelStore", () => {
  describe("Side Management", () => {
    it("should register side L successfully");
    it("should register side R successfully");
    it("should reject registration if side occupied");
    it("should release side on disconnect");
    it("should track socket to side mapping");
  });

  describe("Authentication", () => {
    it("should authenticate with valid OTP");
    it("should reject invalid OTP");
    it("should require side registration before auth");
  });

  describe("Practice Tracking", () => {
    it("should increment practice count");
    it("should track practice per side independently");
    it("should cap practice at max count");
  });

  describe("Ready State", () => {
    it("should track ready state per participant");
    it("should correctly report areBothReady");
    it("should correctly report areBothInLobby");
  });

  describe("Results", () => {
    it("should add paired results");
    it("should calculate winner correctly");
    it("should handle tie");
    it("should preserve result history");
  });
});
```

#### `tribes-server/src/tests/duel-service.test.ts`
```typescript
describe("DuelService", () => {
  describe("registerSystem", () => {
    it("should succeed for available side");
    it("should fail for occupied side");
    it("should fail when duel disabled");
    it("should fail if already registered");
  });

  describe("authenticate", () => {
    it("should succeed with valid OTP");
    it("should fail without side registration");
    it("should fail with invalid OTP");
    it("should update socket name on success");
  });

  describe("practiceComplete", () => {
    it("should require authentication");
    it("should increment practice count");
    it("should reject if already at max");
  });

  describe("joinLobby", () => {
    it("should require authentication");
    it("should require practice completion");
    it("should create room for first participant");
    it("should join existing room for second");
    it("should emit player_joined to opponent");
  });
});
```

### 3.2 Frontend Unit Tests

#### `frontend/src/tests/duel-state.test.ts`
```typescript
describe("DuelState", () => {
  describe("Side Persistence", () => {
    it("should persist side to localStorage");
    it("should restore side from localStorage");
    it("should clear side from localStorage on clearSide");
  });

  describe("Flow State", () => {
    it("should initialize to SYSTEM_SELECT without persisted side");
    it("should initialize to OTP with persisted side");
    it("should transition through states correctly");
  });
});
```

#### `frontend/src/tests/duel-time-sync.test.ts`
```typescript
describe("DuelTimeSync", () => {
  it("should calculate server offset from samples");
  it("should use median of 3 samples");
  it("should schedule callback at correct client time");
  it("should handle past timestamps immediately");
});
```

### 3.3 Integration Tests

```typescript
describe("Duel Flow Integration", () => {
  it("should complete full flow: system -> OTP -> practice x2 -> lobby -> race -> results");
  it("should handle L disconnect during practice");
  it("should handle R disconnect during lobby");
  it("should synchronize race start within 50ms");
  it("should produce identical words for both sides");
  it("should persist results after race completion");
});
```

### 3.4 Manual Test Checklist

- [ ] System Selection persists across page refresh (F5)
- [ ] System Selection clears with "Change Side" button
- [ ] OTP page shows correct side label
- [ ] OTP authentication works with valid ID
- [ ] OTP authentication fails with invalid ID
- [ ] Practice 1 starts automatically after auth
- [ ] Practice 2 starts automatically after practice 1
- [ ] Lobby shows "Waiting for opponent" for first player
- [ ] Lobby shows "Both players present" when second joins
- [ ] Both players see same words (verify first 5 words)
- [ ] Race starts at same moment (within human perception)
- [ ] Results show both WPM side by side
- [ ] Refresh from results returns to OTP page
- [ ] Live WPM endpoint returns current values during race
- [ ] Results endpoint returns history after race

---

## Part 4: Implementation Order

### Phase 1: Backend Foundation
1. Create `config.ts` with duel config
2. Create `duel-otp.json` with test entries
3. Create `duel-otp.ts` loader
4. Create `duel-store.ts`
5. Write duel-store unit tests
6. Create `duel-service.ts`
7. Write duel-service unit tests
8. Create `duel-controller.ts`
9. Update `events.ts` with duel events
10. Update `app.ts` to register handlers and HTTP endpoints

### Phase 2: Frontend Foundation
1. Create `duel-state.ts`
2. Create `duel-time-sync.ts`
3. Create `tribe-page-system.ts`
4. Create `tribe-page-otp.ts`
5. Add HTML for system and OTP pages
6. Add SCSS for new pages
7. Create `duel.ts` socket routes
8. Update `tribe-socket/index.ts`

### Phase 3: Flow Integration
1. Create `duel-flow.ts`
2. Modify `tribe.ts` to use duel flow
3. Create `test-completed-event.ts`
4. Hook test completion in `test-logic.ts`
5. Create `duel-guard.ts` for navigation

### Phase 4: Synchronized Start
1. Update `race-service.ts` for `startAt`
2. Update `room_init_race` to include `startAt`
3. Implement client-side scheduled start

### Phase 5: Results & Live WPM
1. Update `race-service.ts` to update duel live WPM
2. Update `race-service.ts` to record paired results
3. Test HTTP endpoints

### Phase 6: Testing & Polish
1. Run all unit tests
2. Perform manual smoke tests
3. Fix any synchronization issues
4. Verify word determinism

---

## Appendix A: Socket Event Summary

### Client -> Server
| Event | Data | Auth Required | Description |
|-------|------|---------------|-------------|
| `duel_register_system` | `{ side: "L"\|"R" }` | No | Register for a side |
| `duel_authenticate` | `{ otp: string }` | Side registered | Authenticate with OTP |
| `duel_practice_complete` | `{}` | Yes | Report practice run done |
| `duel_join_lobby` | `{}` | Yes + 2 practices | Join duel lobby |
| `duel_time_sync` | `{ clientTime: number }` | No | Sync time with server |

### Server -> Client
| Event | Data | Description |
|-------|------|-------------|
| `duel_opponent_joined` | `{ username, side }` | Opponent entered lobby |
| `duel_opponent_left` | `{ side }` | Opponent disconnected |
| `room_init_race` | `{ seed, startAt? }` | Race starting (extended) |

---

## Appendix B: HTTP Endpoints

| Method | Path | Response | Description |
|--------|------|----------|-------------|
| GET | `/duel/live-wpm` | `{ L: {...}, R: {...} }` | Current WPM for both sides |
| GET | `/duel/results` | `DuelResult[]` | History of duel results |

---

## Appendix C: State Machine

```
┌─────────────────┐
│ SYSTEM_SELECT   │ (no side persisted)
└────────┬────────┘
         │ selectSide()
         v
┌─────────────────┐
│ OTP             │ (side persisted, returns here on refresh)
└────────┬────────┘
         │ authenticate()
         v
┌─────────────────┐
│ PRACTICE_1      │
└────────┬────────┘
         │ test complete
         v
┌─────────────────┐
│ PRACTICE_2      │
└────────┬────────┘
         │ test complete, joinLobby()
         v
┌─────────────────┐
│ LOBBY           │ (wait for opponent, ready up)
└────────┬────────┘
         │ both ready, room_init_race
         v
┌─────────────────┐
│ RACING          │
└────────┬────────┘
         │ race complete
         v
┌─────────────────┐
│ RESULTS         │ (refresh -> OTP)
└─────────────────┘
```

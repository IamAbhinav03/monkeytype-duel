// Duel state management - singleton store for duel-specific state
import { readFileSync, writeFileSync, existsSync } from "fs";
import { DUEL_CONFIG, type DuelSide } from "../config.js";
import Logger from "../utils/logger.js";

/**
 * Represents a participant in a duel (one per side L/R)
 */
export interface DuelParticipant {
  socketId: string;
  userId: string; // OTP ID
  username: string;
  practiceCount: number;
  isReady: boolean;
  isAuthenticated: boolean;
}

/**
 * Live WPM data for a side during an active race
 */
export interface DuelLiveWpm {
  side: DuelSide;
  wpm: number;
  raw: number;
  acc: number;
  progress: number;
  updatedAt: number;
}

/**
 * A completed duel result record
 */
export interface DuelResult {
  timestamp: number;
  L: { wpm: number; raw: number; acc: number; consistency: number };
  R: { wpm: number; raw: number; acc: number; consistency: number };
  winner: DuelSide | "TIE";
}

class DuelStore {
  // Side occupancy: L/R -> participant or null if empty
  private sides: Map<DuelSide, DuelParticipant | null> = new Map([
    ["L", null],
    ["R", null],
  ]);

  // Reverse lookup: socketId -> side
  private socketToSide: Map<string, DuelSide> = new Map();

  // Active duel room ID (only one duel at a time)
  private activeRoomId: string | null = null;

  // Live WPM per side during race
  private liveWpm: Map<DuelSide, DuelLiveWpm> = new Map();

  // Result history (persists across duels, cleared on server restart)
  private results: DuelResult[] = [];

  // ============================================================
  // Side Management
  // ============================================================

  /**
   * Register a socket for a side (L or R).
   * Returns true if successful, false if side is occupied.
   */
  registerSide(socketId: string, side: DuelSide): boolean {
    if (this.sides.get(side) !== null) {
      return false; // Side already occupied
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

  /**
   * Release a side when socket disconnects.
   * Returns the released side or undefined if not found.
   */
  releaseSide(socketId: string): DuelSide | undefined {
    const side = this.socketToSide.get(socketId);
    if (side === undefined) return undefined;

    this.sides.set(side, null);
    this.socketToSide.delete(socketId);
    this.liveWpm.delete(side);
    return side;
  }

  /**
   * Get the side for a socket ID.
   */
  getSideBySocket(socketId: string): DuelSide | undefined {
    return this.socketToSide.get(socketId);
  }

  /**
   * Get the participant for a side.
   */
  getParticipant(side: DuelSide): DuelParticipant | null {
    return this.sides.get(side) ?? null;
  }

  /**
   * Get the participant by socket ID.
   */
  getParticipantBySocket(socketId: string): DuelParticipant | null {
    const side = this.socketToSide.get(socketId);
    return side !== undefined ? (this.sides.get(side) ?? null) : null;
  }

  /**
   * Transfer a side from an old socket to a new socket.
   * Preserves authentication and practice state.
   * Returns the participant data if successful, null otherwise.
   */
  transferSide(
    oldSocketId: string,
    newSocketId: string,
  ): DuelParticipant | null {
    const side = this.socketToSide.get(oldSocketId);
    if (side === undefined) return null;

    const participant = this.sides.get(side);
    if (!participant) return null;

    // Update socket mappings
    this.socketToSide.delete(oldSocketId);
    this.socketToSide.set(newSocketId, side);
    participant.socketId = newSocketId;

    return participant;
  }

  /**
   * Check if a side is available (unoccupied).
   */
  isSideAvailable(side: DuelSide): boolean {
    return this.sides.get(side) === null;
  }

  /**
   * Get both participants.
   */
  getParticipants(): { L: DuelParticipant | null; R: DuelParticipant | null } {
    return {
      L: this.sides.get("L") ?? null,
      R: this.sides.get("R") ?? null,
    };
  }

  // ============================================================
  // Authentication
  // ============================================================

  /**
   * Authenticate a socket with user ID and username.
   * Requires socket to be registered to a side first.
   */
  authenticate(socketId: string, userId: string, username: string): boolean {
    const participant = this.getParticipantBySocket(socketId);
    if (!participant) return false;

    participant.userId = userId;
    participant.username = username;
    participant.isAuthenticated = true;
    return true;
  }

  /**
   * Check if a socket is authenticated.
   */
  isAuthenticated(socketId: string): boolean {
    return this.getParticipantBySocket(socketId)?.isAuthenticated ?? false;
  }

  // ============================================================
  // Practice Tracking
  // ============================================================

  /**
   * Increment practice count for a socket.
   * Returns new count, or -1 if not found.
   */
  incrementPractice(socketId: string): number {
    const participant = this.getParticipantBySocket(socketId);
    if (!participant) return -1;

    participant.practiceCount += 1;
    return participant.practiceCount;
  }

  /**
   * Get practice count for a socket.
   */
  getPracticeCount(socketId: string): number {
    return this.getParticipantBySocket(socketId)?.practiceCount ?? 0;
  }

  // ============================================================
  // Ready State
  // ============================================================

  /**
   * Set ready state for a socket.
   */
  setReady(socketId: string, ready: boolean): void {
    const participant = this.getParticipantBySocket(socketId);
    if (participant) {
      participant.isReady = ready;
    }
  }

  /**
   * Toggle ready state for a socket. Returns new state.
   */
  toggleReady(socketId: string): boolean {
    const participant = this.getParticipantBySocket(socketId);
    if (participant) {
      participant.isReady = !participant.isReady;
      return participant.isReady;
    }
    return false;
  }

  /**
   * Check if both sides are ready.
   */
  areBothReady(): boolean {
    const L = this.sides.get("L");
    const R = this.sides.get("R");
    return (L?.isReady ?? false) && (R?.isReady ?? false);
  }

  /**
   * Check if both sides are in the lobby (authenticated + practice complete).
   */
  areBothInLobby(requiredPractice: number): boolean {
    const L = this.sides.get("L");
    const R = this.sides.get("R");
    if (L === null || L === undefined || R === null || R === undefined) {
      return false;
    }
    return (
      L.isAuthenticated &&
      R.isAuthenticated &&
      L.practiceCount >= requiredPractice &&
      R.practiceCount >= requiredPractice
    );
  }

  // ============================================================
  // Room Management
  // ============================================================

  /**
   * Set the active duel room ID.
   */
  setActiveRoom(roomId: string): void {
    this.activeRoomId = roomId;
  }

  /**
   * Get the active duel room ID.
   */
  getActiveRoom(): string | null {
    return this.activeRoomId;
  }

  /**
   * Clear the active duel room.
   */
  clearActiveRoom(): void {
    this.activeRoomId = null;
  }

  // ============================================================
  // Live WPM
  // ============================================================

  /**
   * Update live WPM for a socket during a race.
   */
  updateLiveWpm(
    socketId: string,
    data: { wpm: number; raw: number; acc: number; progress: number },
  ): void {
    const side = this.socketToSide.get(socketId);
    if (!side) return;

    this.liveWpm.set(side, {
      ...data,
      side,
      updatedAt: Date.now(),
    });
  }

  /**
   * Get live WPM for both sides.
   */
  getLiveWpm(): { L: DuelLiveWpm | null; R: DuelLiveWpm | null } {
    return {
      L: this.liveWpm.get("L") ?? null,
      R: this.liveWpm.get("R") ?? null,
    };
  }

  /**
   * Clear live WPM data.
   */
  clearLiveWpm(): void {
    this.liveWpm.clear();
  }

  // ============================================================
  // Results
  // ============================================================

  /**
   * Add a completed duel result and persist to disk.
   */
  addResult(
    L: { wpm: number; raw: number; acc: number; consistency: number },
    R: { wpm: number; raw: number; acc: number; consistency: number },
  ): DuelResult {
    const winner: DuelSide | "TIE" =
      L.wpm > R.wpm ? "L" : R.wpm > L.wpm ? "R" : "TIE";

    const result: DuelResult = {
      timestamp: Date.now(),
      L,
      R,
      winner,
    };

    this.results.push(result);
    this.persistResults();
    return result;
  }

  /**
   * Get all duel results (copy).
   */
  getResults(): DuelResult[] {
    return [...this.results];
  }

  /**
   * Get the most recent result.
   */
  getLatestResult(): DuelResult | undefined {
    return this.results[this.results.length - 1];
  }

  /**
   * Load results from disk. Safe to call at startup.
   */
  loadResults(): void {
    const path = DUEL_CONFIG.RESULTS_PATH;
    if (!existsSync(path)) {
      Logger.info(`No existing results file at ${path}, starting fresh`);
      return;
    }

    try {
      const raw = readFileSync(path, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.results = parsed as DuelResult[];
        Logger.success(
          `Loaded ${this.results.length} duel results from ${path}`,
        );
      }
    } catch (error) {
      Logger.warning(`Failed to load duel results: ${error}`);
    }
  }

  /**
   * Persist results to disk.
   */
  persistResults(): void {
    try {
      writeFileSync(
        DUEL_CONFIG.RESULTS_PATH,
        JSON.stringify(this.results, null, 2),
        "utf-8",
      );
    } catch (error) {
      Logger.warning(`Failed to persist duel results: ${error}`);
    }
  }

  // ============================================================
  // Reset
  // ============================================================

  /**
   * Reset for next duel (keeps sides registered, clears ready state).
   */
  resetForNextDuel(): void {
    for (const [_side, participant] of this.sides) {
      if (participant) {
        participant.isReady = false;
        // Don't reset practiceCount - they stay authenticated
      }
    }
    this.liveWpm.clear();
  }

  /**
   * Full reset (clears everything except results history).
   */
  fullReset(): void {
    this.sides.set("L", null);
    this.sides.set("R", null);
    this.socketToSide.clear();
    this.activeRoomId = null;
    this.liveWpm.clear();
    // Keep results for history
  }

  /**
   * Clear all data including results.
   */
  clearAll(): void {
    this.fullReset();
    this.results = [];
  }
}

export const duelStore = new DuelStore();

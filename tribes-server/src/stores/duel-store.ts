// Duel state management - singleton store for duel-specific state
import { readFileSync, existsSync } from "fs";
import { writeFile } from "fs/promises";
import { DUEL_CONFIG, type DuelSide } from "../config.js";
import Logger from "../utils/logger.js";

const MAX_STORED_RESULTS = 1000;
const PERSIST_DEBOUNCE_MS = 25;

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

export interface DuelResultSide {
  userId: string;
  username: string;
  wpm: number;
  raw: number;
  acc: number;
  consistency: number;
}

type DuelResultWinner = DuelSide | "TIE";

/**
 * A completed duel result record
 */
export interface DuelResult {
  timestamp: number;
  L: DuelResultSide;
  R: DuelResultSide;
  winner: DuelResultWinner;
}

export interface DuelLeaderboardEntry {
  name: string;
  wpm: number;
  acc: number;
  raw: number;
  consistency: number;
  date: number;
}

export type DuelLeaderboard = Record<string, DuelLeaderboardEntry>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeIdentity(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeResultSide(
  side: DuelSide,
  value: unknown,
): DuelResultSide | null {
  if (value === null || value === undefined || typeof value !== "object") {
    return null;
  }

  const resultSide = value as Record<string, unknown>;
  const wpm = resultSide["wpm"];
  const raw = resultSide["raw"];
  const acc = resultSide["acc"];
  const consistency = resultSide["consistency"];

  if (
    !isFiniteNumber(wpm) ||
    !isFiniteNumber(raw) ||
    !isFiniteNumber(acc) ||
    !isFiniteNumber(consistency)
  ) {
    return null;
  }

  const username = sanitizeIdentity(resultSide["username"], `System ${side}`);
  const userId = sanitizeIdentity(resultSide["userId"], `${side}:${username}`);

  return {
    userId,
    username,
    wpm,
    raw,
    acc,
    consistency,
  };
}

function computeWinner(L: DuelResultSide, R: DuelResultSide): DuelResultWinner {
  return L.wpm > R.wpm ? "L" : R.wpm > L.wpm ? "R" : "TIE";
}

function normalizeLeaderboardEntry(
  value: unknown,
): DuelLeaderboardEntry | null {
  if (value === null || value === undefined || typeof value !== "object") {
    return null;
  }

  const entry = value as Record<string, unknown>;
  const name = entry["name"];
  const wpm = entry["wpm"];
  const raw = entry["raw"];
  const acc = entry["acc"];
  const consistency = entry["consistency"];
  const date = entry["date"];

  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    !isFiniteNumber(wpm) ||
    !isFiniteNumber(raw) ||
    !isFiniteNumber(acc) ||
    !isFiniteNumber(consistency) ||
    !isFiniteNumber(date)
  ) {
    return null;
  }

  return {
    name: name.trim(),
    wpm,
    raw,
    acc,
    consistency,
    date,
  };
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

  // Latest final race result per OTP/user ID
  private leaderboard: DuelLeaderboard = {};

  // Async persistence state (debounced + coalesced)
  private persistDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  private persistInFlight = false;
  private persistRequested = false;

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

  deauthenticate(socketId: string): boolean {
    const participant = this.getParticipantBySocket(socketId);
    if (!participant) return false;

    participant.userId = "";
    participant.username = "";
    participant.practiceCount = 0;
    participant.isReady = false;
    participant.isAuthenticated = false;
    return true;
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
  addResult(L: DuelResultSide, R: DuelResultSide): DuelResult {
    const result: DuelResult = {
      timestamp: Date.now(),
      L,
      R,
      winner: computeWinner(L, R),
    };

    this.results.push(result);
    this.trimResultsIfNeeded();
    this.upsertLeaderboardEntry(L, result.timestamp);
    this.upsertLeaderboardEntry(R, result.timestamp);
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
   * Project duel results into a stable identity map keyed by OTP/user ID.
   * Each entry represents the latest final race result for that user.
   */
  getLeaderboard(): DuelLeaderboard {
    return { ...this.leaderboard };
  }

  /**
   * Get the most recent result.
   */
  getLatestResult(): DuelResult | undefined {
    return this.results[this.results.length - 1];
  }

  /**
   * Seed the leaderboard with placeholder entries for all OTP users.
   * Placeholder entries have wpm: -1 and appear greyed out on the frontend.
   * Only adds entries for users not already in the leaderboard.
   */
  seedLeaderboardFromOtpMap(otpMap: Readonly<Record<string, string>>): void {
    let seeded = 0;
    for (const [otpCode, username] of Object.entries(otpMap)) {
      if (this.leaderboard[otpCode]) continue;
      this.leaderboard[otpCode] = {
        name: username,
        wpm: -1,
        acc: -1,
        raw: -1,
        consistency: -1,
        date: 0,
      };
      seeded++;
    }
    if (seeded > 0) {
      this.persistResults();
      Logger.info(
        `Seeded ${seeded} placeholder leaderboard entries from OTP map`,
      );
    }
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
        const normalized = parsed
          .map((value, index) => this.normalizeResult(value, index))
          .filter((value): value is DuelResult => value !== null);
        this.results = normalized;
        this.trimResultsIfNeeded();
        this.rebuildLeaderboardFromResults();
        Logger.success(
          `Loaded ${this.results.length} duel results from ${path}`,
        );
      } else if (
        parsed !== null &&
        parsed !== undefined &&
        typeof parsed === "object"
      ) {
        const record = parsed as Record<string, unknown>;
        const rawResults = record["results"];
        const rawLeaderboard = record["leaderboard"];

        if (Array.isArray(rawResults)) {
          this.results = rawResults
            .map((value, index) => this.normalizeResult(value, index))
            .filter((value): value is DuelResult => value !== null);
          this.trimResultsIfNeeded();
        } else {
          this.results = [];
        }

        this.leaderboard = this.normalizeLeaderboard(rawLeaderboard);
        if (Object.keys(this.leaderboard).length === 0) {
          this.rebuildLeaderboardFromResults();
        }

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
    this.persistRequested = true;

    if (this.persistDebounceTimer || this.persistInFlight) {
      return;
    }

    this.persistDebounceTimer = setTimeout(() => {
      this.persistDebounceTimer = undefined;
      this.flushPersist();
    }, PERSIST_DEBOUNCE_MS);
  }

  private flushPersist(): void {
    if (!this.persistRequested || this.persistInFlight) return;

    this.persistRequested = false;
    this.persistInFlight = true;

    const payload = JSON.stringify(
      {
        results: this.results,
        leaderboard: this.leaderboard,
      },
      null,
      2,
    );

    void writeFile(DUEL_CONFIG.RESULTS_PATH, payload, "utf-8")
      .catch((error) => {
        Logger.warning(`Failed to persist duel results: ${error}`);
      })
      .finally(() => {
        this.persistInFlight = false;
        if (this.persistRequested) {
          this.flushPersist();
        }
      });
  }

  private normalizeLeaderboard(value: unknown): DuelLeaderboard {
    if (value === null || value === undefined || typeof value !== "object") {
      return {};
    }

    const leaderboard: DuelLeaderboard = {};
    for (const [id, entry] of Object.entries(value)) {
      const normalizedId = sanitizeIdentity(id, "");
      if (normalizedId === "") continue;

      const normalizedEntry = normalizeLeaderboardEntry(entry);
      if (!normalizedEntry) continue;

      leaderboard[normalizedId] = normalizedEntry;
    }
    return leaderboard;
  }

  /**
   * Set a leaderboard entry directly (admin use).
   */
  setLeaderboardEntry(userId: string, entry: DuelLeaderboardEntry): void {
    this.leaderboard[userId] = entry;
    this.persistResults();
  }

  private upsertLeaderboardEntry(
    side: DuelResultSide,
    timestamp: number,
  ): void {
    this.leaderboard[side.userId] = {
      name: side.username,
      wpm: side.wpm,
      acc: side.acc,
      raw: side.raw,
      consistency: side.consistency,
      date: timestamp,
    };
  }

  private rebuildLeaderboardFromResults(): void {
    this.leaderboard = {};
    for (const result of this.results) {
      this.upsertLeaderboardEntry(result.L, result.timestamp);
      this.upsertLeaderboardEntry(result.R, result.timestamp);
    }
  }

  private normalizeResult(value: unknown, index: number): DuelResult | null {
    if (value === null || value === undefined || typeof value !== "object") {
      Logger.warning(`Skipping invalid duel result at index ${index}`);
      return null;
    }

    const record = value as Record<string, unknown>;
    const L = normalizeResultSide("L", record["L"]);
    const R = normalizeResultSide("R", record["R"]);

    if (!L || !R) {
      Logger.warning(
        `Skipping duel result at index ${index} due to malformed side data`,
      );
      return null;
    }

    const winnerRaw = record["winner"];
    const winner: DuelResultWinner =
      winnerRaw === "L" || winnerRaw === "R" || winnerRaw === "TIE"
        ? winnerRaw
        : computeWinner(L, R);

    const timestamp = isFiniteNumber(record["timestamp"])
      ? record["timestamp"]
      : Date.now();

    return {
      timestamp,
      L,
      R,
      winner,
    };
  }

  private trimResultsIfNeeded(): void {
    if (this.results.length <= MAX_STORED_RESULTS) return;

    const overflow = this.results.length - MAX_STORED_RESULTS;
    this.results.splice(0, overflow);
    Logger.info(
      `Trimmed ${overflow} old duel result(s); keeping latest ${MAX_STORED_RESULTS}`,
    );
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
    this.leaderboard = {};
  }
}

export const duelStore = new DuelStore();

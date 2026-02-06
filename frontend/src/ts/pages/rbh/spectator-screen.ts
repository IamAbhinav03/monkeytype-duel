import Page from "../../pages/page";
import { qs, ElementWithUtils, createElementWithUtils } from "../../utils/dom";
import { addToGlobal } from "../../utils/misc";
import { getTribesServerUrl } from "../../utils/tribe";
import { io, type Socket } from "socket.io-client";

// ============ TYPES ============

type LeaderboardEntry = {
  id: string;
  name: string;
  wpm: number;
  acc: number;
  raw: number;
  consistency: number;
  date: number;
};

type PlayerState = {
  name: string;
  wpm: number;
  isConnected: boolean;
};

type DuelState = {
  player1: PlayerState;
  player2: PlayerState;
  timeLeft: number;
  maxTime: number;
};

type DuelSpectatorSide = {
  id: string;
  name: string;
  wpm: number;
  connected: boolean;
};

type DuelSpectatorPayload = {
  serverTime: number;
  roomId: string | null;
  roomState: string | null;
  active: boolean;
  race: {
    startAt: number | null;
    duration: number;
  };
  sides: {
    L: DuelSpectatorSide | null;
    R: DuelSpectatorSide | null;
  };
};

type DuelSpectatorSubscribeResponse = {
  ok: boolean;
  state: DuelSpectatorPayload;
  leaderboard: unknown;
};

type ViewType = "leaderboard" | "duel";

// ============ CONFIGURATION ============
const DUEL_LEADERBOARD_ENDPOINT = "/duel/leaderboard";
const DUEL_SPECTATOR_ENDPOINT = "/duel/spectator";
const LEADERBOARD_POLL_INTERVAL_MS = 1000;
const DUEL_STATE_POLL_INTERVAL_MS = 250;
const SPECTATOR_SUBSCRIBE_TIMEOUT_MS = 4000;
const DUEL_CLOCK_TICK_MS = 100;
const FALLBACK_DATA_PATH = "/data/dummy-participants.json";
const DEFAULT_LEFT_NAME = "System Left";
const DEFAULT_RIGHT_NAME = "System Right";

// ============ STATE ============

// Current view
let currentView: ViewType = "leaderboard";

// Leaderboard state
let entries: LeaderboardEntry[] = [];
let leaderboardPollInterval: ReturnType<typeof setInterval> | undefined;
let leaderboardFetchInFlight = false;
let hasWarnedLeaderboardFetch = false;
let duelStatePollInterval: ReturnType<typeof setInterval> | undefined;
let duelStateFetchInFlight = false;
let hasWarnedDuelStateFetch = false;
let duelClockInterval: ReturnType<typeof setInterval> | undefined;
let duelClockStartAt: number | null = null;
let duelClockDuration = 30;
let duelServerOffset = 0;
let spectatorSocket: Socket | null = null;
let spectatorSubscribeTimeout: ReturnType<typeof setTimeout> | undefined;

// Duel state
const duelState: DuelState = {
  player1: { name: "", wpm: 0, isConnected: false },
  player2: { name: "", wpm: 0, isConnected: false },
  timeLeft: 30,
  maxTime: 30,
};

// DOM cache
let pageElement: ElementWithUtils | null = null;
let placeholderSummaryEl: ElementWithUtils | null = null;

// ============ HELPERS ============

function getPageElement(): ElementWithUtils | null {
  pageElement ??= qs("#pageRbhSpectatorScreen");
  return pageElement;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getDuelLeaderboardUrl(): string {
  return `${getTribesServerUrl()}${DUEL_LEADERBOARD_ENDPOINT}`;
}

function getDuelSpectatorUrl(): string {
  return `${getTribesServerUrl()}${DUEL_SPECTATOR_ENDPOINT}`;
}

function normalizeLeaderboardEntry(
  value: unknown,
  fallbackId?: string,
): LeaderboardEntry | null {
  if (value === null || value === undefined || typeof value !== "object") {
    return null;
  }

  const entry = value as Record<string, unknown>;
  const id = entry["id"];
  const name = entry["name"];
  const wpm = entry["wpm"];
  const acc = entry["acc"];
  const raw = entry["raw"];
  const consistency = entry["consistency"];
  const date = entry["date"];

  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    !isFiniteNumber(wpm) ||
    !isFiniteNumber(acc) ||
    !isFiniteNumber(raw) ||
    !isFiniteNumber(consistency)
  ) {
    return null;
  }

  const resolvedId =
    typeof id === "string" && id.trim().length > 0
      ? id.trim()
      : (fallbackId ?? name.trim());

  return {
    id: resolvedId,
    name: name.trim(),
    wpm,
    acc,
    raw,
    consistency,
    date: isFiniteNumber(date) ? date : Date.now(),
  };
}

function parseLeaderboardPayload(payload: unknown): LeaderboardEntry[] {
  const parsed: LeaderboardEntry[] = [];

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const normalized = normalizeLeaderboardEntry(item);
      if (normalized) {
        parsed.push(normalized);
      }
    }
    return parsed;
  }

  if (
    payload !== null &&
    payload !== undefined &&
    typeof payload === "object"
  ) {
    for (const [id, value] of Object.entries(payload)) {
      const normalized = normalizeLeaderboardEntry(value, id);
      if (normalized) {
        parsed.push(normalized);
      }
    }
    return parsed;
  }

  return parsed;
}

function isSameEntry(a: LeaderboardEntry, b: LeaderboardEntry): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.wpm === b.wpm &&
    a.acc === b.acc &&
    a.raw === b.raw &&
    a.consistency === b.consistency &&
    a.date === b.date
  );
}

function splitLeaderboardEntries(sortedEntries: LeaderboardEntry[]): {
  activeEntries: LeaderboardEntry[];
  placeholderCount: number;
} {
  const activeEntries: LeaderboardEntry[] = [];
  let placeholderCount = 0;

  for (const entry of sortedEntries) {
    if (entry.wpm === -1) {
      placeholderCount++;
      continue;
    }
    activeEntries.push(entry);
  }

  return { activeEntries, placeholderCount };
}

function reconcileLeaderboard(nextEntries: LeaderboardEntry[]): void {
  const container = getContainer();
  if (container === null) return;

  const sortedNext = [...nextEntries].sort(leaderboardSort);
  const { activeEntries, placeholderCount } =
    splitLeaderboardEntries(sortedNext);

  // Fast path: if we have no cached state at all, do a full init
  if (rowNodeMap.size === 0 && entryCache.size === 0) {
    init(sortedNext);
    return;
  }

  const nextIdSet = new Set<string>();
  for (const entry of activeEntries) {
    nextIdSet.add(entry.id);
  }

  // --- Remove stale entries (present in old set but not in new set) ---
  const staleIds: string[] = [];
  for (const [id, row] of rowNodeMap) {
    if (!nextIdSet.has(id)) {
      staleIds.push(id);
      row.remove();
    }
  }
  for (const id of staleIds) {
    rowNodeMap.delete(id);
    entryCache.delete(id);
  }

  // --- Add new entries & patch changed entries ---
  for (let i = 0; i < activeEntries.length; i++) {
    const entry = activeEntries[i];
    if (!entry) continue;
    let row = rowNodeMap.get(entry.id);

    if (row === undefined) {
      // Brand new entry: create DOM node
      row = createRow(entry, i + 1);
      container.append(row);
      rowNodeMap.set(entry.id, row);
      entryCache.set(entry.id, { ...entry });
    } else {
      // Existing entry: patch only changed cells
      const cached = entryCache.get(entry.id);
      if (!cached || !isSameEntry(cached, entry)) {
        updateRowContent(row, entry, i + 1);
        entryCache.set(entry.id, { ...entry });
      } else {
        // Data identical -- but rank might have shifted
        const rankEl = row.native.children[0];
        const rankStr = String(i + 1);
        if (rankEl && rankEl.textContent !== rankStr) {
          rankEl.textContent = rankStr;
        }
        applyTierClass(row, i + 1, false);
      }
    }
  }

  // Update the authoritative entries array
  entries = sortedNext;
  updatePlaceholderSummary(container, placeholderCount);

  // Reorder DOM to match new sort order (with bounded FLIP animations)
  reorderAndAnimate(container, activeEntries);
}

async function fetchLeaderboardFromServer(): Promise<
  LeaderboardEntry[] | null
> {
  const response = await fetch(getDuelLeaderboardUrl(), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload: unknown = await response.json();
  return parseLeaderboardPayload(payload);
}

async function fetchFallbackLeaderboard(): Promise<LeaderboardEntry[]> {
  const response = await fetch(FALLBACK_DATA_PATH, {
    cache: "no-store",
  });
  if (!response.ok) return [];
  const payload: unknown = await response.json();
  return parseLeaderboardPayload(payload);
}

async function syncLeaderboardFromServer(): Promise<boolean> {
  if (leaderboardFetchInFlight) return false;
  leaderboardFetchInFlight = true;

  try {
    const nextEntries = await fetchLeaderboardFromServer();
    if (nextEntries !== null) {
      reconcileLeaderboard(nextEntries);
    }
    hasWarnedLeaderboardFetch = false;
    return true;
  } catch (error) {
    if (!hasWarnedLeaderboardFetch) {
      console.warn(
        "[SpectatorScreen] Failed to fetch duel leaderboard:",
        error,
      );
      hasWarnedLeaderboardFetch = true;
    }
    return false;
  } finally {
    leaderboardFetchInFlight = false;
  }
}

function startLeaderboardPolling(): void {
  stopLeaderboardPolling();
  leaderboardPollInterval = setInterval(() => {
    void syncLeaderboardFromServer();
  }, LEADERBOARD_POLL_INTERVAL_MS);
}

function stopLeaderboardPolling(): void {
  if (leaderboardPollInterval) {
    clearInterval(leaderboardPollInterval);
    leaderboardPollInterval = undefined;
  }
}

function normalizeSpectatorSide(
  value: unknown,
  fallbackName: string,
): DuelSpectatorSide | null {
  if (value === null || value === undefined || typeof value !== "object") {
    return null;
  }

  const side = value as Record<string, unknown>;
  const id = side["id"];
  const name = side["name"];
  const wpm = side["wpm"];
  const connected = side["connected"];

  if (typeof id !== "string" || id.trim().length === 0) return null;

  return {
    id: id.trim(),
    name:
      typeof name === "string" && name.trim().length > 0
        ? name.trim()
        : fallbackName,
    wpm: isFiniteNumber(wpm) ? wpm : 0,
    connected: typeof connected === "boolean" ? connected : true,
  };
}

function parseDuelSpectatorPayload(
  payload: unknown,
): DuelSpectatorPayload | null {
  if (
    payload === null ||
    payload === undefined ||
    typeof payload !== "object"
  ) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const serverTime = record["serverTime"];
  const active = record["active"];
  const race = record["race"];
  const sides = record["sides"];
  const roomId = record["roomId"];
  const roomState = record["roomState"];

  if (!isFiniteNumber(serverTime) || typeof active !== "boolean") {
    return null;
  }

  if (race === null || race === undefined || typeof race !== "object") {
    return null;
  }
  if (sides === null || sides === undefined || typeof sides !== "object") {
    return null;
  }

  const raceRecord = race as Record<string, unknown>;
  const startAtRaw = raceRecord["startAt"];
  const durationRaw = raceRecord["duration"];

  const sidesRecord = sides as Record<string, unknown>;
  const left = normalizeSpectatorSide(sidesRecord["L"], DEFAULT_LEFT_NAME);
  const right = normalizeSpectatorSide(sidesRecord["R"], DEFAULT_RIGHT_NAME);

  return {
    serverTime,
    roomId: typeof roomId === "string" ? roomId : null,
    roomState: typeof roomState === "string" ? roomState : null,
    active,
    race: {
      startAt: isFiniteNumber(startAtRaw) ? startAtRaw : null,
      duration:
        isFiniteNumber(durationRaw) && durationRaw > 0 ? durationRaw : 30,
    },
    sides: {
      L: left,
      R: right,
    },
  };
}

function stopDuelClock(): void {
  if (duelClockInterval) {
    clearInterval(duelClockInterval);
    duelClockInterval = undefined;
  }
}

function resetDuelClock(): void {
  stopDuelClock();
  duelClockStartAt = null;
  duelClockDuration = 30;
  duelServerOffset = 0;
}

function getSyncedServerNow(): number {
  return Date.now() + duelServerOffset;
}

function tickDuelClock(): void {
  if (duelClockStartAt === null) {
    updateTimer(duelClockDuration, duelClockDuration);
    return;
  }

  const elapsed = Math.max(0, (getSyncedServerNow() - duelClockStartAt) / 1000);
  const timeLeft = Math.max(0, duelClockDuration - elapsed);
  updateTimer(timeLeft, duelClockDuration);
}

function syncDuelClock(
  startAt: number | null,
  duration: number,
  serverTime: number,
): void {
  duelClockDuration = duration > 0 ? duration : 30;
  duelServerOffset = serverTime - Date.now();
  duelClockStartAt = startAt;

  tickDuelClock();

  if (duelClockStartAt === null) {
    stopDuelClock();
    return;
  }

  duelClockInterval ??= setInterval(() => {
    tickDuelClock();
  }, DUEL_CLOCK_TICK_MS);
}

function applyDuelSpectatorState(state: DuelSpectatorPayload): void {
  const left = state.sides.L;
  const right = state.sides.R;

  updatePlayer1({
    name: left?.name ?? DEFAULT_LEFT_NAME,
    wpm: left?.wpm ?? 0,
    isConnected: left?.connected ?? false,
  });
  updatePlayer2({
    name: right?.name ?? DEFAULT_RIGHT_NAME,
    wpm: right?.wpm ?? 0,
    isConnected: right?.connected ?? false,
  });

  syncDuelClock(state.race.startAt, state.race.duration, state.serverTime);

  if (state.active) {
    void showDuel();
  } else {
    void showLeaderboard();
  }
}

async function fetchDuelStateFromServer(): Promise<DuelSpectatorPayload | null> {
  const response = await fetch(getDuelSpectatorUrl(), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();
  return parseDuelSpectatorPayload(payload);
}

async function syncDuelStateFromServer(): Promise<boolean> {
  if (duelStateFetchInFlight) return false;
  duelStateFetchInFlight = true;

  try {
    const payload = await fetchDuelStateFromServer();
    hasWarnedDuelStateFetch = false;
    if (!payload) return false;
    applyDuelSpectatorState(payload);
    return true;
  } catch (error) {
    if (!hasWarnedDuelStateFetch) {
      console.warn("[SpectatorScreen] Failed to fetch duel live state:", error);
      hasWarnedDuelStateFetch = true;
    }
    return false;
  } finally {
    duelStateFetchInFlight = false;
  }
}

function startDuelStatePolling(): void {
  stopDuelStatePolling();
  duelStatePollInterval = setInterval(() => {
    void syncDuelStateFromServer();
  }, DUEL_STATE_POLL_INTERVAL_MS);
}

function stopDuelStatePolling(): void {
  if (duelStatePollInterval) {
    clearInterval(duelStatePollInterval);
    duelStatePollInterval = undefined;
  }
}

function startFallbackPolling(): void {
  startDuelStatePolling();
  startLeaderboardPolling();
}

function stopFallbackPolling(): void {
  stopDuelStatePolling();
  stopLeaderboardPolling();
}

function clearSpectatorSubscribeTimeout(): void {
  if (!spectatorSubscribeTimeout) return;
  clearTimeout(spectatorSubscribeTimeout);
  spectatorSubscribeTimeout = undefined;
}

function onSpectatorStatePushed(payload: unknown): void {
  const parsed = parseDuelSpectatorPayload(payload);
  if (!parsed) return;
  applyDuelSpectatorState(parsed);
}

function onLeaderboardPushed(payload: unknown): void {
  const parsed = parseLeaderboardPayload(payload);
  reconcileLeaderboard(parsed);
}

function subscribeSpectatorFeed(): void {
  if (!spectatorSocket || !spectatorSocket.connected) return;

  clearSpectatorSubscribeTimeout();
  spectatorSubscribeTimeout = setTimeout(() => {
    startFallbackPolling();
    console.warn(
      `[SpectatorScreen] duel_spectator_subscribe timeout (${SPECTATOR_SUBSCRIBE_TIMEOUT_MS}ms), using HTTP fallback`,
    );
  }, SPECTATOR_SUBSCRIBE_TIMEOUT_MS);

  spectatorSocket.emit(
    "duel_spectator_subscribe",
    (response: DuelSpectatorSubscribeResponse) => {
      clearSpectatorSubscribeTimeout();

      if (!response.ok) {
        startFallbackPolling();
        return;
      }

      stopFallbackPolling();
      const parsedState = parseDuelSpectatorPayload(response.state);
      if (parsedState) {
        applyDuelSpectatorState(parsedState);
      }
      onLeaderboardPushed(response.leaderboard);
    },
  );
}

function setupSpectatorPush(): void {
  teardownSpectatorPush();

  spectatorSocket = io(getTribesServerUrl(), {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    query: {
      name: "Spectator",
    },
  });

  spectatorSocket.on("connect", () => {
    subscribeSpectatorFeed();
  });

  spectatorSocket.on("duel_spectator_state", (payload: unknown) => {
    onSpectatorStatePushed(payload);
  });

  spectatorSocket.on("duel_leaderboard_snapshot", (payload: unknown) => {
    onLeaderboardPushed(payload);
  });

  spectatorSocket.on("disconnect", () => {
    startFallbackPolling();
  });

  spectatorSocket.on("connect_error", (error: Error) => {
    startFallbackPolling();
    console.warn("[SpectatorScreen] Spectator socket connect error:", error);
  });
}

function teardownSpectatorPush(): void {
  clearSpectatorSubscribeTimeout();

  if (!spectatorSocket) return;

  if (spectatorSocket.connected) {
    spectatorSocket.emit("duel_spectator_unsubscribe");
  }
  spectatorSocket.removeAllListeners();
  spectatorSocket.disconnect();
  spectatorSocket = null;
}

// ============ VIEW SWITCHING ============

const TRANSITION_DURATION = 600; // ms
let isTransitioning = false;

export async function showLeaderboard(): Promise<void> {
  if (currentView === "leaderboard" || isTransitioning) return;

  const page = getPageElement();
  if (!page) return;

  const leaderboardView = page.qs("#leaderboardView");
  const duelView = page.qs("#duelView");

  if (!leaderboardView || !duelView) return;

  isTransitioning = true;

  // Fade out + blur current view
  duelView.addClass("transitioning-out");

  await new Promise((resolve) => setTimeout(resolve, TRANSITION_DURATION));

  duelView.addClass("hidden");
  duelView.removeClass("transitioning-out");

  // Show and fade in new view
  leaderboardView.removeClass("hidden");
  leaderboardView.addClass("transitioning-in");

  // Force reflow before removing transition class
  void leaderboardView.native.offsetHeight;

  await new Promise((resolve) => setTimeout(resolve, 50));
  leaderboardView.removeClass("transitioning-in");

  currentView = "leaderboard";
  isTransitioning = false;
}

export async function showDuel(): Promise<void> {
  if (currentView === "duel" || isTransitioning) return;

  const page = getPageElement();
  if (!page) return;

  const leaderboardView = page.qs("#leaderboardView");
  const duelView = page.qs("#duelView");
  const countdownOverlay = page.qs("#countdownOverlay");
  const countdownNumber = page.qs("#countdownNumber");

  if (!leaderboardView || !duelView || !countdownOverlay || !countdownNumber) {
    return;
  }

  isTransitioning = true;

  // Fade out leaderboard
  leaderboardView.addClass("transitioning-out");
  await new Promise((resolve) => setTimeout(resolve, TRANSITION_DURATION));

  leaderboardView.addClass("hidden");
  leaderboardView.removeClass("transitioning-out");

  // Show duel view blurred behind countdown
  duelView.removeClass("hidden");
  duelView.setStyle({ filter: "blur(24px)", opacity: "0.5" });

  // Show countdown overlay with fade-in
  countdownOverlay.addClass("fade-in");
  countdownOverlay.removeClass("hidden");
  void countdownOverlay.native.offsetHeight; // Force reflow
  countdownOverlay.removeClass("fade-in");

  // Run 10-second countdown
  for (let i = 10; i >= 1; i--) {
    countdownNumber.setText(i.toString());
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Fade out countdown overlay
  countdownOverlay.addClass("fade-out");
  await new Promise((resolve) => setTimeout(resolve, 400));
  countdownOverlay.addClass("hidden");
  countdownOverlay.removeClass("fade-out");

  // Reveal duel view (remove blur)
  duelView.setStyle({ filter: "blur(0)", opacity: "1" });
  duelView.addClass("transitioning-in");

  void duelView.native.offsetHeight;
  await new Promise((resolve) => setTimeout(resolve, 50));
  duelView.removeClass("transitioning-in");

  currentView = "duel";
  isTransitioning = false;
}

export function getCurrentView(): ViewType {
  return currentView;
}

// ============ LEADERBOARD FUNCTIONS ============

// --- Optimization caches ---
// Maps entry.id -> the live DOM node for that row (avoids re-querying)
const rowNodeMap = new Map<string, ElementWithUtils>();
// Maps entry.id -> the last-rendered data snapshot (avoids redundant DOM writes)
const entryCache = new Map<string, LeaderboardEntry>();
// Cached container reference (avoids re-querying #leaderboardBody every tick)
let cachedContainer: ElementWithUtils | null = null;

// FLIP animation threshold: only animate position changes for the top N rows.
// Rows beyond this index skip getBoundingClientRect entirely.
const FLIP_ANIMATION_LIMIT = 20;

function getContainer(): ElementWithUtils | null {
  cachedContainer ??= qs("#leaderboardBody");
  return cachedContainer;
}

function clearCaches(): void {
  rowNodeMap.clear();
  entryCache.clear();
  placeholderSummaryEl = null;
}

// --- Formatting helpers (pure, no DOM) ---

function formatStat(
  val: number,
  isPlaceholder: boolean,
  isPct: boolean = false,
): string {
  if (isPlaceholder) return "-";
  return isPct ? Math.floor(val) + "%" : String(Math.round(val));
}

function formatFloat(
  val: number,
  isPlaceholder: boolean,
  isPct: boolean = false,
): string {
  if (isPlaceholder) return "-";
  return isPct ? val.toFixed(2) + "%" : val.toFixed(2);
}

function formatDate(date: number, isPlaceholder: boolean): string {
  if (isPlaceholder || date <= 0) return "-";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const TIER_CLASSES = [
  "tier-podium",
  "tier-contender",
  "tier-field",
  "tier-placeholder",
];

function setTextIfChanged(target: Element | null, value: string): void {
  if (target && target.textContent !== value) {
    target.textContent = value;
  }
}

function applyTierClass(
  row: ElementWithUtils,
  rank: number,
  isPlaceholder: boolean,
): void {
  row.removeClass(TIER_CLASSES);
  row.addClass(getTierClass(rank, isPlaceholder));
}

// --- Row creation (only used for genuinely new entries) ---

function createRow(entry: LeaderboardEntry, rank: number): ElementWithUtils {
  const isPlaceholder = entry.wpm === -1;
  const row = createElementWithUtils("div", {
    classList: ["leaderboardRow", getTierClass(rank, isPlaceholder)],
    dataset: { key: entry.id, name: entry.name },
  });

  row.setHtml(`
        <div class="col rank">${rank}</div>
        <div class="col name">
            <div class="avatarNameBadge">
                 <div class="avatar"><i class="fas fa-user-circle"></i></div>
                 <div class="name">${entry.name}</div>
            </div>
        </div>
        <div class="col stat narrow">${formatStat(entry.wpm, isPlaceholder)}</div>
        <div class="col stat narrow">${formatStat(entry.raw, isPlaceholder)}</div>
        <div class="col stat wide">${formatFloat(entry.wpm, isPlaceholder)}</div>
        <div class="col stat wide">${formatFloat(entry.acc, isPlaceholder, true)}</div>
        <div class="col stat wide">${formatFloat(entry.raw, isPlaceholder)}</div>
        <div class="col stat wide">${formatFloat(entry.consistency, isPlaceholder, true)}</div>
        <div class="col date">${formatDate(entry.date, isPlaceholder)}</div>
    `);

  return row;
}

// --- In-place cell patching (avoids destroying/recreating the row) ---

function updateRowContent(
  row: ElementWithUtils,
  entry: LeaderboardEntry,
  rank: number,
): void {
  const native = row.native;
  const children = native.children;
  // children order must match createRow's HTML structure:
  //  [0] rank, [1] name wrapper, [2] wpm-stat-narrow, [3] raw-stat-narrow,
  //  [4] wpm-stat-wide, [5] acc-stat-wide, [6] raw-stat-wide,
  //  [7] consistency-stat-wide, [8] date
  if (children.length < 9) return;

  const isPlaceholder = entry.wpm === -1;
  const cached = entryCache.get(entry.id);
  applyTierClass(row, rank, isPlaceholder);

  // Rank always needs checking because it depends on sort position
  const rankStr = String(rank);
  setTextIfChanged(children.item(0), rankStr);

  // Only patch fields that actually changed vs. the cached version
  if (!cached || cached.name !== entry.name) {
    // Update the nested .name element inside avatarNameBadge
    const nameWrapper = children.item(1);
    if (nameWrapper instanceof HTMLElement) {
      const nameEl = nameWrapper.querySelector(".name");
      setTextIfChanged(nameEl, entry.name);
    }
    // Also update data-name attribute
    native.dataset["name"] = entry.name;
  }

  if (!cached || cached.wpm !== entry.wpm) {
    const wpmNarrow = formatStat(entry.wpm, isPlaceholder);
    setTextIfChanged(children.item(2), wpmNarrow);
    const wpmWide = formatFloat(entry.wpm, isPlaceholder);
    setTextIfChanged(children.item(4), wpmWide);
  }

  if (!cached || cached.raw !== entry.raw) {
    const rawNarrow = formatStat(entry.raw, isPlaceholder);
    setTextIfChanged(children.item(3), rawNarrow);
    const rawWide = formatFloat(entry.raw, isPlaceholder);
    setTextIfChanged(children.item(6), rawWide);
  }

  if (!cached || cached.acc !== entry.acc) {
    const accWide = formatFloat(entry.acc, isPlaceholder, true);
    setTextIfChanged(children.item(5), accWide);
  }

  if (!cached || cached.consistency !== entry.consistency) {
    const conWide = formatFloat(entry.consistency, isPlaceholder, true);
    setTextIfChanged(children.item(7), conWide);
  }

  if (!cached || cached.date !== entry.date) {
    const dateStr = formatDate(entry.date, isPlaceholder);
    setTextIfChanged(children.item(8), dateStr);
  }
}

// --- Sort comparator: wpm descending, placeholders (wpm === -1) to bottom ---

function leaderboardSort(a: LeaderboardEntry, b: LeaderboardEntry): number {
  // Placeholders always go to the bottom
  if (a.wpm === -1 && b.wpm !== -1) return 1;
  if (a.wpm !== -1 && b.wpm === -1) return -1;
  return b.wpm - a.wpm;
}

// --- Tier classification ---

function getTierClass(rank: number, isPlaceholder: boolean): string {
  if (isPlaceholder) return "tier-placeholder";
  if (rank <= 3) return "tier-podium";
  if (rank <= 10) return "tier-contender";
  return "tier-field";
}

// --- Placeholder summary (collapses N placeholders into one row) ---

function createPlaceholderSummary(count: number): ElementWithUtils {
  const s = count !== 1 ? "s" : "";
  const row = createElementWithUtils("div", {
    classList: ["leaderboardRow", "placeholder-summary"],
  });
  row.setHtml(`
    <div class="col rank"><i class="fas fa-hourglass-half"></i></div>
    <div class="col name">
      <span class="placeholder-count">${count}</span>
      participant${s} awaiting first race
    </div>
    <div class="col stat narrow">&mdash;</div>
    <div class="col stat narrow">&mdash;</div>
    <div class="col stat wide">&mdash;</div>
    <div class="col stat wide">&mdash;</div>
    <div class="col stat wide">&mdash;</div>
    <div class="col stat wide">&mdash;</div>
    <div class="col date">&mdash;</div>
  `);
  return row;
}

function updatePlaceholderSummary(
  container: ElementWithUtils,
  count: number,
): void {
  if (count === 0) {
    if (placeholderSummaryEl) {
      placeholderSummaryEl.remove();
      placeholderSummaryEl = null;
    }
    return;
  }

  if (!placeholderSummaryEl) {
    placeholderSummaryEl = createPlaceholderSummary(count);
  } else {
    const nameCol = placeholderSummaryEl.native.querySelector(".col.name");
    if (nameCol) {
      const s = count !== 1 ? "s" : "";
      nameCol.innerHTML = `<span class="placeholder-count">${count}</span> participant${s} awaiting first race`;
    }
  }

  // Always ensure summary is at the bottom
  container.append(placeholderSummaryEl);
}

// --- Reorder DOM nodes to match the entries array, with bounded FLIP ---

function reorderAndAnimate(
  container: ElementWithUtils,
  sortedEntries: LeaderboardEntry[],
  changedId?: string,
): void {
  const containerNative = container.native;

  // --- FLIP: First --- batch all layout reads BEFORE any writes ---
  // Only measure positions for the top N rows to avoid thrashing
  const oldPositions = new Map<string, number>();
  const measureLimit = Math.min(sortedEntries.length, FLIP_ANIMATION_LIMIT);

  for (let i = 0; i < measureLimit; i++) {
    const measuredEntry = sortedEntries[i];
    if (!measuredEntry) continue;
    const id = measuredEntry.id;
    const node = rowNodeMap.get(id);
    if (node !== undefined) {
      oldPositions.set(id, node.native.getBoundingClientRect().top);
    }
  }

  // --- Reorder DOM nodes using insertBefore ---
  // This moves existing nodes without destroying them.
  // If the node is already in the correct position, insertBefore is a no-op
  // in terms of the browser's internal representation.
  let refNode: Node | null = containerNative.firstChild;
  for (const entry of sortedEntries) {
    const row = rowNodeMap.get(entry.id);
    if (row === undefined) continue;
    const rowNative = row.native;

    if (refNode !== rowNative) {
      // Move node to the correct position
      containerNative.insertBefore(rowNative, refNode);
    } else {
      // Already in position, advance reference
      refNode = refNode.nextSibling;
    }
  }

  // --- FLIP: Last + Invert + Play --- only for top N rows ---
  requestAnimationFrame(() => {
    for (let i = 0; i < measureLimit; i++) {
      const entry = sortedEntries[i];
      if (!entry) continue;
      const id = entry.id;
      const node = rowNodeMap.get(id);
      if (node === undefined) continue;

      const oldTop = oldPositions.get(id);
      if (oldTop === undefined) {
        // New entry appearing in top N -- fade in
        node.animate({ opacity: [0, 1], duration: 300 });
        continue;
      }

      const newTop = node.native.getBoundingClientRect().top;
      const delta = oldTop - newTop;

      if (delta === 0 && id !== changedId) continue;

      const isTarget = id === changedId;
      if (isTarget) {
        node.native.style.zIndex = "100";
        node.native.style.position = "relative";
        node.animate({
          translateY: [delta, delta * 0.3, 0],
          scale: [1, 1.03, 1.03, 1],
          boxShadow: [
            "0 0 0 0 transparent",
            "0 8px 32px rgba(255,255,255,0.15), 0 4px 16px rgba(100,200,255,0.2)",
            "0 8px 32px rgba(255,255,255,0.15), 0 4px 16px rgba(100,200,255,0.2)",
            "0 0 0 0 transparent",
          ],
          duration: 1000,
          easing: "easeOutExpo",
        });
      } else if (delta !== 0) {
        node.animate({
          translateY: [delta, 0],
          duration: 600,
          easing: "easeOutQuint",
        });
      }
    }
  });
}

// --- Public API: init (full rebuild, used only on first load or hard reset) ---

export function init(initialData: LeaderboardEntry[]): void {
  const container = getContainer();
  if (container === null) return;

  clearCaches();
  entries = [...initialData].sort(leaderboardSort);
  const { activeEntries, placeholderCount } = splitLeaderboardEntries(entries);

  container.empty();
  for (let i = 0; i < activeEntries.length; i++) {
    const entry = activeEntries[i];
    if (!entry) continue;
    const row = createRow(entry, i + 1);
    container.append(row);
    rowNodeMap.set(entry.id, row);
    entryCache.set(entry.id, { ...entry });
  }
  updatePlaceholderSummary(container, placeholderCount);
}

// --- Public API: update (single-entry change, differential) ---

export function update(updatedEntry: LeaderboardEntry): void {
  const container = getContainer();
  if (container === null) return;

  // Update or insert into the entries array
  const idx = entries.findIndex((e) => e.id === updatedEntry.id);
  if (idx !== -1) {
    entries[idx] = updatedEntry;
  } else {
    entries.push(updatedEntry);
  }

  // Re-sort the data
  entries.sort(leaderboardSort);
  const { activeEntries, placeholderCount } = splitLeaderboardEntries(entries);
  const activeIdSet = new Set(activeEntries.map((entry) => entry.id));

  // Remove stale rows (deleted entries or entries that turned into placeholders)
  const staleIds: string[] = [];
  for (const [id, row] of rowNodeMap) {
    if (!activeIdSet.has(id)) {
      staleIds.push(id);
      row.remove();
    }
  }
  for (const staleId of staleIds) {
    rowNodeMap.delete(staleId);
    entryCache.delete(staleId);
  }

  // Ensure rows exist for all active entries
  for (let i = 0; i < activeEntries.length; i++) {
    const entry = activeEntries[i];
    if (!entry) continue;
    if (!rowNodeMap.has(entry.id)) {
      const row = createRow(entry, i + 1);
      container.append(row);
      rowNodeMap.set(entry.id, row);
      entryCache.set(entry.id, { ...entry });
    }
  }

  // Patch all rows whose rank or data changed, then reorder DOM
  for (let i = 0; i < activeEntries.length; i++) {
    const entry = activeEntries[i];
    if (!entry) continue;
    const existingRow = rowNodeMap.get(entry.id);
    if (existingRow === undefined) continue;
    const cached = entryCache.get(entry.id);
    // Only touch DOM if data changed or rank shifted
    if (!cached || !isSameEntry(cached, entry)) {
      updateRowContent(existingRow, entry, i + 1);
      entryCache.set(entry.id, { ...entry });
    } else {
      // Rank might have changed even if data is the same (another entry moved)
      const rankEl = existingRow.native.children[0];
      const rankStr = String(i + 1);
      if (rankEl && rankEl.textContent !== rankStr) {
        rankEl.textContent = rankStr;
      }
      applyTierClass(existingRow, i + 1, false);
    }
  }

  updatePlaceholderSummary(container, placeholderCount);
  reorderAndAnimate(
    container,
    activeEntries,
    updatedEntry.wpm === -1 ? undefined : updatedEntry.id,
  );
}

// ============ DUEL FUNCTIONS ============

function updateTugOfWar(): void {
  const page = getPageElement();
  if (!page) return;

  const leftSide = page.qs(".leftSide");
  const rightSide = page.qs(".rightSide");

  if (!leftSide || !rightSide) return;

  const { player1, player2 } = duelState;

  let position = 50;

  if (player1.isConnected && player2.isConnected) {
    const totalWpm = player1.wpm + player2.wpm;
    if (totalWpm > 0) {
      position = (player1.wpm / totalWpm) * 100;
      position += (Math.random() - 0.5) * 1.5;
    }
  }

  position = Math.max(2, Math.min(98, position));

  leftSide.setStyle({ width: `${position}%` });
  rightSide.setStyle({ width: `${100 - position}%` });

  leftSide.setStyle({ clipPath: "" });
  rightSide.setStyle({ clipPath: "" });
}

function updateCrown(): void {
  const page = getPageElement();
  if (!page) return;

  const crown1 = page.qs(".player1 .crown");
  const crown2 = page.qs(".player2 .crown");

  if (!crown1 || !crown2) return;

  const { player1, player2 } = duelState;

  crown1.addClass("hidden");
  crown2.addClass("hidden");

  if (player1.isConnected && player2.isConnected) {
    if (player1.wpm > player2.wpm) {
      crown1.removeClass("hidden");
    } else if (player2.wpm > player1.wpm) {
      crown2.removeClass("hidden");
    }
  }
}

function updatePlayerCard(playerNum: 1 | 2, playerState: PlayerState): void {
  const page = getPageElement();
  if (!page) return;

  const card = page.qs(`.player${playerNum}`);
  if (!card) return;

  const playerInfo = card.qs(".playerInfo");
  const waitingState = card.qs(".waitingState");
  const nameElement = card.qs(".name");
  const wpmValue = card.qs(".wpmValue");
  const waitingText = card.qs(".waitingText");

  if (!playerInfo || !waitingState || !nameElement || !wpmValue) return;

  const fallbackName = playerNum === 1 ? DEFAULT_LEFT_NAME : DEFAULT_RIGHT_NAME;

  if (playerState.isConnected) {
    playerInfo.removeClass("hidden");
    waitingState.addClass("hidden");
    nameElement.setText(
      playerState.name !== "" ? playerState.name : fallbackName,
    );
    wpmValue.setText(Math.round(playerState.wpm).toString());
  } else {
    playerInfo.addClass("hidden");
    waitingState.removeClass("hidden");
    waitingText?.setText(`Waiting for ${playerState.name || fallbackName}`);
  }
}

function updateTimerDisplay(): void {
  const page = getPageElement();
  if (!page) return;

  const timerValue = page.qs(".timerValue");
  if (!timerValue) return;

  timerValue.setText(Math.max(0, Math.round(duelState.timeLeft)).toString());

  const timerDisplay = page.qs(".timerDisplay");
  if (timerDisplay) {
    if (duelState.timeLeft <= 10) {
      timerDisplay.addClass("urgent");
    } else {
      timerDisplay.removeClass("urgent");
    }
  }
}

export function reset(): void {
  duelState.player1 = { name: DEFAULT_LEFT_NAME, wpm: 0, isConnected: false };
  duelState.player2 = { name: DEFAULT_RIGHT_NAME, wpm: 0, isConnected: false };
  duelState.timeLeft = 30;
  duelState.maxTime = 30;

  updatePlayerCard(1, duelState.player1);
  updatePlayerCard(2, duelState.player2);
  updateTimerDisplay();
  updateTugOfWar();
  updateCrown();
}

export function updatePlayer1(data: Partial<PlayerState>): void {
  duelState.player1 = { ...duelState.player1, ...data };
  updatePlayerCard(1, duelState.player1);
  updateTugOfWar();
  updateCrown();
}

export function updatePlayer2(data: Partial<PlayerState>): void {
  duelState.player2 = { ...duelState.player2, ...data };
  updatePlayerCard(2, duelState.player2);
  updateTugOfWar();
  updateCrown();
}

export function updateTimer(timeLeft: number, maxTime?: number): void {
  duelState.timeLeft = timeLeft;
  if (maxTime !== undefined) {
    duelState.maxTime = maxTime;
  }
  updateTimerDisplay();
  updateTugOfWar();
}

export function getState(): DuelState {
  return { ...duelState };
}

// ============ PAGE DEFINITION ============

export const page = new Page({
  id: "rbhSpectatorScreen",
  element: qs("#pageRbhSpectatorScreen") as ElementWithUtils,
  path: "/rbh/spectator-screen",
  beforeShow: async () => {
    pageElement = null;
    cachedContainer = null;
    currentView = "leaderboard";
    entries = [];
    clearCaches();
    hasWarnedLeaderboardFetch = false;
    leaderboardFetchInFlight = false;
    hasWarnedDuelStateFetch = false;
    duelStateFetchInFlight = false;
    teardownSpectatorPush();
    stopFallbackPolling();
    resetDuelClock();
    reset();
  },
  afterShow: async () => {
    addToGlobal({
      spectatorScreen: {
        showLeaderboard,
        showDuel,
        getCurrentView,
        init,
        update,
        updatePlayer1,
        updatePlayer2,
        updateTimer,
        reset,
        getState,
      },
    });

    const duelLoaded = await syncDuelStateFromServer();
    if (!duelLoaded) {
      void showLeaderboard();
    }

    const loadedFromServer = await syncLeaderboardFromServer();
    if (!loadedFromServer) {
      const fallbackEntries = await fetchFallbackLeaderboard().catch(
        (): LeaderboardEntry[] => [],
      );
      reconcileLeaderboard(fallbackEntries);
    }

    setupSpectatorPush();
  },
  beforeHide: async () => {
    teardownSpectatorPush();
    stopFallbackPolling();
    stopDuelClock();
  },
});

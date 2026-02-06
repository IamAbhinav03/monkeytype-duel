import Page from "../../pages/page";
import { qs, ElementWithUtils, createElementWithUtils } from "../../utils/dom";
import { addToGlobal } from "../../utils/misc";
import { getTribesServerUrl } from "../../utils/tribe";

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

type ViewType = "leaderboard" | "duel";

// ============ CONFIGURATION ============
const DUEL_LEADERBOARD_ENDPOINT = "/duel/leaderboard";
const DUEL_SPECTATOR_ENDPOINT = "/duel/spectator";
const LEADERBOARD_POLL_INTERVAL_MS = 1000;
const DUEL_STATE_POLL_INTERVAL_MS = 250;
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

// Duel state
const duelState: DuelState = {
  player1: { name: "", wpm: 0, isConnected: false },
  player2: { name: "", wpm: 0, isConnected: false },
  timeLeft: 30,
  maxTime: 30,
};

// DOM cache
let pageElement: ElementWithUtils | null = null;

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

function reconcileLeaderboard(nextEntries: LeaderboardEntry[]): void {
  const sortedNext = [...nextEntries].sort((a, b) => b.wpm - a.wpm);

  const nextIdSet = new Set(sortedNext.map((entry) => entry.id));
  const sameShape =
    entries.length === sortedNext.length &&
    entries.every((entry) => nextIdSet.has(entry.id));

  if (!sameShape || (entries.length === 0 && sortedNext.length === 0)) {
    init(sortedNext);
    return;
  }

  for (const nextEntry of sortedNext) {
    const existing = entries.find((entry) => entry.id === nextEntry.id);
    if (!existing || !isSameEntry(existing, nextEntry)) {
      update(nextEntry);
    }
  }
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

  if (!leaderboardView || !duelView) return;

  isTransitioning = true;

  // Fade out + blur current view
  leaderboardView.addClass("transitioning-out");

  await new Promise((resolve) => setTimeout(resolve, TRANSITION_DURATION));

  leaderboardView.addClass("hidden");
  leaderboardView.removeClass("transitioning-out");

  // Show and fade in new view
  duelView.removeClass("hidden");
  duelView.addClass("transitioning-in");

  // Force reflow before removing transition class
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

function createRow(entry: LeaderboardEntry, rank: number): ElementWithUtils {
  const row = createElementWithUtils("div", {
    classList: ["leaderboardRow"],
    dataset: { key: entry.id, name: entry.name },
  });

  const isPlaceholder = entry.wpm === -1;

  const formatStat = (val: number, isPct: boolean = false): string | number => {
    if (isPlaceholder) return "-";
    return isPct ? Math.floor(val) + "%" : Math.round(val);
  };

  const formatFloat = (val: number, isPct: boolean = false): string => {
    if (isPlaceholder) return "-";
    return isPct ? val.toFixed(2) + "%" : val.toFixed(2);
  };

  const dateStr =
    !isPlaceholder && entry.date > 0
      ? new Date(entry.date).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "-";

  row.setHtml(`
        <div class="col rank">${rank}</div>
        <div class="col name">
            <div class="avatarNameBadge">
                 <div class="avatar"><i class="fas fa-user-circle"></i></div>
                 <div class="name">${entry.name}</div>
            </div>
        </div>
        <div class="col stat narrow">${formatStat(entry.wpm)}</div>
        <div class="col stat narrow">${formatStat(entry.raw)}</div>
        <div class="col stat wide">${formatFloat(entry.wpm)}</div>
        <div class="col stat wide">${formatFloat(entry.acc, true)}</div>
        <div class="col stat wide">${formatFloat(entry.raw)}</div>
        <div class="col stat wide">${formatFloat(entry.consistency, true)}</div>
        <div class="col date">${dateStr}</div>
    `);

  return row;
}

export function init(initialData: LeaderboardEntry[]): void {
  entries = [...initialData].sort((a, b) => b.wpm - a.wpm);
  const container = qs("#leaderboardBody");
  if (container === null) return;

  container.empty();
  entries.forEach((e, i) => {
    container.append(createRow(e, i + 1));
  });
}

export function update(updatedEntry: LeaderboardEntry): void {
  const container = qs("#leaderboardBody");
  if (container === null) return;

  const idx = entries.findIndex((e) => e.id === updatedEntry.id);
  if (idx !== -1) entries[idx] = updatedEntry;
  else entries.push(updatedEntry);

  const oldPositions = new Map<string, number>();
  container.qsa(".leaderboardRow").forEach((row) => {
    const key = row.native.dataset["key"];
    if (key !== undefined && key !== "") {
      oldPositions.set(key, row.native.getBoundingClientRect().top);
    }
  });

  entries.sort((a, b) => b.wpm - a.wpm);
  container.empty();
  entries.forEach((e, i) => {
    container.append(createRow(e, i + 1));
  });

  container.qsa(".leaderboardRow").forEach((row) => {
    const key = row.native.dataset["key"];
    if (key === undefined || key === "") return;

    const oldTop = oldPositions.get(key);
    const newTop = row.native.getBoundingClientRect().top;

    if (oldTop !== undefined) {
      const delta = oldTop - newTop;
      const isTarget = key === updatedEntry.id;

      if (delta !== 0 || isTarget) {
        if (isTarget) {
          row.native.style.zIndex = "100";
          row.native.style.position = "relative";
          row.animate({
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
        } else {
          row.animate({
            translateY: [delta, 0],
            duration: 600,
            easing: "easeOutQuint",
          });
        }
      }
    } else {
      row.animate({ opacity: [0, 1], duration: 300 });
    }
  });
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
    currentView = "leaderboard";
    entries = [];
    hasWarnedLeaderboardFetch = false;
    leaderboardFetchInFlight = false;
    hasWarnedDuelStateFetch = false;
    duelStateFetchInFlight = false;
    stopLeaderboardPolling();
    stopDuelStatePolling();
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

    startDuelStatePolling();
    startLeaderboardPolling();
  },
  beforeHide: async () => {
    stopLeaderboardPolling();
    stopDuelStatePolling();
    stopDuelClock();
  },
});

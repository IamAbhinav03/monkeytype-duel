import Page from "../../pages/page";
import { qs, ElementWithUtils, createElementWithUtils } from "../../utils/dom";
import { addToGlobal } from "../../utils/misc";

// ============ TYPES ============

type LeaderboardEntry = {
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

type ViewType = "leaderboard" | "duel";

// ============ CONFIGURATION ============
const USE_DUMMY_DATA = true;
const DUMMY_DATA_PATH = "/data/dummy-participants.json";
const PROD_DATA_PATH = "/data/participants.json";

// ============ STATE ============

// Current view
// let currentView: ViewType = "leaderboard";
let currentView: ViewType = "duel";

// Leaderboard state
let entries: LeaderboardEntry[] = [];

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

function createRow(entry: LeaderboardEntry, rank: number): ElementWithUtils {
  const row = createElementWithUtils("div", {
    classList: ["leaderboardRow"],
    dataset: { name: entry.name },
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

  const idx = entries.findIndex((e) => e.name === updatedEntry.name);
  if (idx !== -1) entries[idx] = updatedEntry;
  else entries.push(updatedEntry);

  const oldPositions = new Map<string, number>();
  container.qsa(".leaderboardRow").forEach((row) => {
    const name = row.native.dataset["name"];
    if (name !== undefined && name !== "") {
      oldPositions.set(name, row.native.getBoundingClientRect().top);
    }
  });

  entries.sort((a, b) => b.wpm - a.wpm);
  container.empty();
  entries.forEach((e, i) => {
    container.append(createRow(e, i + 1));
  });

  container.qsa(".leaderboardRow").forEach((row) => {
    const name = row.native.dataset["name"];
    if (name === undefined || name === "") return;

    const oldTop = oldPositions.get(name);
    const newTop = row.native.getBoundingClientRect().top;

    if (oldTop !== undefined) {
      const delta = oldTop - newTop;
      const isTarget = name === updatedEntry.name;

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

  if (!playerInfo || !waitingState || !nameElement || !wpmValue) return;

  if (playerState.isConnected) {
    playerInfo.removeClass("hidden");
    waitingState.addClass("hidden");
    nameElement.setText(
      playerState.name !== "" ? playerState.name : `Player ${playerNum}`,
    );
    wpmValue.setText(Math.round(playerState.wpm).toString());
  } else {
    playerInfo.addClass("hidden");
    waitingState.removeClass("hidden");
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
  duelState.player1 = { name: "", wpm: 0, isConnected: false };
  duelState.player2 = { name: "", wpm: 0, isConnected: false };
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
    reset();
  },
  afterShow: async () => {
    void showLeaderboard();

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

    // ============ WEBSOCKET STUB ============
    // TODO: Add WebSocket listener here
    // socket.on("raceStart", () => showDuel());
    // socket.on("raceEnd", () => showLeaderboard());

    const dataPath = USE_DUMMY_DATA ? DUMMY_DATA_PATH : PROD_DATA_PATH;
    const response = await fetch(dataPath);
    const participants = (await response.json()) as LeaderboardEntry[];

    const placeholders = participants
      .map((d) => ({
        ...d,
        wpm: -1,
        acc: -1,
        raw: -1,
        consistency: -1,
        date: -1,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    init(placeholders);

    if (USE_DUMMY_DATA) {
      participants.forEach((realEntry, idx) => {
        setTimeout(
          () => {
            update(realEntry);
          },
          1000 + idx * 800,
        );
      });

      const hamiltonEntry = participants.find((p) => p.name === "Hamilton");
      if (hamiltonEntry) {
        setTimeout(() => {
          update({
            name: hamiltonEntry.name,
            wpm: 200,
            acc: hamiltonEntry.acc,
            raw: hamiltonEntry.raw,
            consistency: hamiltonEntry.consistency,
            date: hamiltonEntry.date,
          });
        }, 7000);
      }
    }
  },
  beforeHide: async () => {
    // Cleanup if needed
  },
});

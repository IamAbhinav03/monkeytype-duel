import Page from "../../pages/page";
import { qs, ElementWithUtils } from "../../utils/dom";
import { addToGlobal } from "../../utils/misc";

// Player state interface
// Player state type
type PlayerState = {
  name: string;
  wpm: number;
  isConnected: boolean;
};

// Timer state
// Timer state
type DuelState = {
  player1: PlayerState;
  player2: PlayerState;
  timeLeft: number;
  maxTime: number;
};

// Initial state
const state: DuelState = {
  player1: { name: "", wpm: 0, isConnected: false },
  player2: { name: "", wpm: 0, isConnected: false },
  timeLeft: 30, // Changed to 30s as requested
  maxTime: 30,
};

// Simulation interval
// Simulation interval removed as simulation is disabled
// let simInterval: ReturnType<typeof setInterval> | null = null;

// DOM element cache
let pageElement: ElementWithUtils | null = null;

/**
 * Get cached page element
 */
function getPageElement(): ElementWithUtils | null {
  pageElement ??= qs("#pageDuelLeaderboard");
  return pageElement;
}

/**
 * Update the tug-of-war rope position and tension
 */
function updateTugOfWar(): void {
  const page = getPageElement();
  if (!page) return;

  // Use specific selectors for split rope
  const leftSide = page.qs(".leftSide");
  const rightSide = page.qs(".rightSide");

  if (!leftSide || !rightSide) return;

  const { player1, player2 } = state;

  let position = 50; // Center by default

  if (player1.isConnected && player2.isConnected) {
    const totalWpm = player1.wpm + player2.wpm;
    if (totalWpm > 0) {
      // Calculate position as percentage (0-100)
      position = (player1.wpm / totalWpm) * 100;
      // Add slight random wobble for realism
      position += (Math.random() - 0.5) * 1.5;
    }
  }

  // Limit range slightly to prevent 0 width
  // Ensure at least some width on both sides
  position = Math.max(2, Math.min(98, position));

  // 1. Update Widths
  leftSide.setStyle({ width: `${position}%` });
  rightSide.setStyle({ width: `${100 - position}%` });

  // Removed tension/pinch effect as requested
  // Rope stays constant thickness

  // Reset clip paths to simple rectangles in case they were set previously
  /*
      leftSide.setStyle({ clipPath: "none" });
      rightSide.setStyle({ clipPath: "none" });
      */
  // Or just clear them if the SCSS handles the shape (rounded corners)
  leftSide.setStyle({ clipPath: "" });
  rightSide.setStyle({ clipPath: "" });
}

/**
 * Update crown visibility based on who's winning
 */
function updateCrown(): void {
  const page = getPageElement();
  if (!page) return;

  const crown1 = page.qs(".player1 .crown");
  const crown2 = page.qs(".player2 .crown");

  if (!crown1 || !crown2) return;

  const { player1, player2 } = state;

  // Hide both crowns first
  crown1.addClass("hidden");
  crown2.addClass("hidden");

  // Show crown on winner
  if (player1.isConnected && player2.isConnected) {
    if (player1.wpm > player2.wpm) {
      crown1.removeClass("hidden");
    } else if (player2.wpm > player1.wpm) {
      crown2.removeClass("hidden");
    }
  }
}

/**
 * Update player card UI
 */
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

/**
 * Update timer display
 */
function updateTimerDisplay(): void {
  const page = getPageElement();
  if (!page) return;

  const timerValue = page.qs(".timerValue");
  if (!timerValue) return;

  timerValue.setText(Math.max(0, Math.round(state.timeLeft)).toString());

  // Add urgency class when time is low
  const timerDisplay = page.qs(".timerDisplay");
  if (timerDisplay) {
    if (state.timeLeft <= 10) {
      timerDisplay.addClass("urgent");
    } else {
      timerDisplay.removeClass("urgent");
    }
  }
}

/**
 * Reset the duel state
 */
export function reset(): void {
  state.player1 = { name: "", wpm: 0, isConnected: false };
  state.player2 = { name: "", wpm: 0, isConnected: false };
  state.timeLeft = 30; // Changed to 30s
  state.maxTime = 30;

  // if (simInterval) clearInterval(simInterval);

  updatePlayerCard(1, state.player1);
  updatePlayerCard(2, state.player2);
  updateTimerDisplay();
  updateTugOfWar();
  updateCrown();
}

/**
 * Start a simulation of a duel
 */
export function startSimulation(): void {
  /*
      reset();
  
      // Simulation steps
      const steps = [
          () => { },
          () => { updatePlayer1({ name: "Joker", wpm: 0, isConnected: true }); },
          () => { updatePlayer2({ name: "Batman", wpm: 0, isConnected: true }); },
          () => {
              state.timeLeft = 30;
              updateTimerDisplay();
          }
      ];
  
      let stepIndex = 0;
      function nextStep() {
          if (stepIndex < steps.length) {
              steps[stepIndex]();
              stepIndex++;
              setTimeout(nextStep, 1000);
          } else {
              startMainLoop();
          }
      }
  
      nextStep();
  
      function startMainLoop() {
          let targetWpm1 = 120;
          let targetWpm2 = 115;
          let currentWpm1 = 0;
          let currentWpm2 = 0;
  
          simInterval = setInterval(() => {
              state.timeLeft -= 0.1;
              if (state.timeLeft <= 0) {
                  state.timeLeft = 0;
                  if (simInterval) clearInterval(simInterval);
                  return;
              }
  
              if (Math.random() < 0.05) targetWpm1 = 80 + Math.random() * 80;
              if (Math.random() < 0.05) targetWpm2 = 80 + Math.random() * 80;
  
              currentWpm1 += (targetWpm1 - currentWpm1) * 0.05;
              currentWpm2 += (targetWpm2 - currentWpm2) * 0.05;
  
              updatePlayer1({ wpm: Math.round(currentWpm1) });
              updatePlayer2({ wpm: Math.round(currentWpm2) });
              updateTimer(state.timeLeft);
  
          }, 100);
      }
      */
}

// ============ PUBLIC API ============

export function updatePlayer1(data: Partial<PlayerState>): void {
  state.player1 = { ...state.player1, ...data };
  updatePlayerCard(1, state.player1);
  updateTugOfWar();
  updateCrown();
}

export function updatePlayer2(data: Partial<PlayerState>): void {
  state.player2 = { ...state.player2, ...data };
  updatePlayerCard(2, state.player2);
  updateTugOfWar();
  updateCrown();
}

export function updateTimer(timeLeft: number, maxTime?: number): void {
  state.timeLeft = timeLeft;
  if (maxTime !== undefined) {
    state.maxTime = maxTime;
  }
  updateTimerDisplay();
  updateTugOfWar();
}

export function getState(): DuelState {
  return { ...state };
}

// Page definition
export const page = new Page({
  id: "duelLeaderboard",
  element: qs("#pageDuelLeaderboard") as ElementWithUtils,
  path: "/rbh/duel-leaderboard",
  beforeShow: async () => {
    pageElement = null;
    reset();
  },
  afterShow: async () => {
    addToGlobal({
      duelLeaderboard: {
        updatePlayer1,
        updatePlayer2,
        updateTimer,
        reset,
        startSimulation,
        getState,
      },
    });
    // setTimeout(startSimulation, 500);
  },
  beforeHide: async () => {
    // if (simInterval) clearInterval(simInterval);
  },
});

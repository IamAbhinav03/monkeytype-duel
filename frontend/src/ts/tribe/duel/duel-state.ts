// Duel client state management
// Handles side persistence, flow state, and authentication status

// --- Types ---
export type DuelSide = "L" | "R";

export type DuelFlowState =
  | "SYSTEM_SELECT" // Choosing L or R
  | "OTP" // Entering OTP
  | "EULA" // Showing competition rules/terms
  | "PRACTICE_1" // First practice (60 sec)
  | "RESULT_1" // Showing result + countdown to practice 2
  | "PRACTICE_2" // Second practice (30 sec)
  | "RESULT_2" // Showing result + countdown to lobby
  | "LOBBY" // Waiting in lobby
  | "RACING" // Active duel
  | "RESULTS"; // Viewing final results

// --- Constants ---
const STORAGE_KEY_SIDE = "duel_side";
const ALLOWED_TRANSITIONS: Record<DuelFlowState, DuelFlowState[]> = {
  SYSTEM_SELECT: ["OTP"],
  OTP: ["EULA"],
  EULA: ["PRACTICE_1"],
  PRACTICE_1: ["RESULT_1"],
  RESULT_1: ["PRACTICE_2"],
  PRACTICE_2: ["RESULT_2"],
  RESULT_2: ["LOBBY"],
  LOBBY: ["RACING"],
  RACING: ["RESULTS", "LOBBY"],
  RESULTS: ["LOBBY"],
};

// --- State ---
// Side is persisted to localStorage so user doesn't have to reselect on refresh
// But authentication is NOT persisted - must re-enter OTP each session
let flowState: DuelFlowState = "SYSTEM_SELECT";
let side: DuelSide | undefined = undefined;
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
  const isResetTransition = state === "OTP" || state === "SYSTEM_SELECT";
  if (
    state !== flowState &&
    !isResetTransition &&
    !(ALLOWED_TRANSITIONS[flowState] ?? []).includes(state)
  ) {
    console.warn(
      `[DuelState] Blocked invalid flow transition: ${flowState} -> ${state}`,
    );
    return;
  }

  flowState = state;
  console.log(`[DuelState] Flow state changed to: ${state}`);

  // Toggle body class for CSS styling during active duel flow
  updateBodyClass();
}

/**
 * Update body class based on current duel flow state.
 * Body class stays active during entire duel flow (including results).
 */
function updateBodyClass(): void {
  if (isInDuelFlow() || flowState === "RESULTS") {
    document.body.classList.add("duelFlowActive");
  } else {
    document.body.classList.remove("duelFlowActive");
  }
}

export function setSide(newSide: DuelSide | undefined): void {
  side = newSide;
  if (newSide) {
    localStorage.setItem(STORAGE_KEY_SIDE, newSide);
    console.log(`[DuelState] Side set to: ${newSide}`);
  } else {
    localStorage.removeItem(STORAGE_KEY_SIDE);
    console.log(`[DuelState] Side cleared`);
  }

  updateBodyClass();
}

export function setAuthenticated(newUserId: string, newUsername: string): void {
  userId = newUserId;
  username = newUsername;
  practiceCount = 0;
  isAuthenticated = true;
  console.log(`[DuelState] Authenticated as: ${newUsername} (${newUserId})`);

  updateBodyClass();
}

export function incrementPractice(): number {
  practiceCount += 1;
  console.log(`[DuelState] Practice count: ${practiceCount}`);
  return practiceCount;
}

// --- Reset Functions ---
export function clearSide(): void {
  side = undefined;
  localStorage.removeItem(STORAGE_KEY_SIDE);
  flowState = "SYSTEM_SELECT";
  userId = undefined;
  username = undefined;
  practiceCount = 0;
  isAuthenticated = false;
  console.log(`[DuelState] Side cleared`);

  updateBodyClass();
}

export function resetToOtp(): void {
  userId = undefined;
  username = undefined;
  practiceCount = 0;
  isAuthenticated = false;
  flowState = "OTP";
  console.log(`[DuelState] Reset to OTP`);

  updateBodyClass();
}

export function fullReset(): void {
  clearSide();
  resetToOtp();
  document.body.classList.remove("duelFlowActive");
  console.log(`[DuelState] Full reset`);
}

export function clearAuthentication(): void {
  userId = undefined;
  username = undefined;
  practiceCount = 0;
  isAuthenticated = false;
  flowState = side ? "OTP" : "SYSTEM_SELECT";

  updateBodyClass();
}

// --- Constants ---
const HARD_REFRESH_FLAG = "duel_hard_refresh";

// --- Initialization ---
export function initDuelState(): DuelFlowState {
  // Check for hard refresh flag (F5/Ctrl+Shift+R)
  if (localStorage.getItem(HARD_REFRESH_FLAG) === "true") {
    localStorage.removeItem(HARD_REFRESH_FLAG);
    localStorage.removeItem(STORAGE_KEY_SIDE);
    side = undefined;
    flowState = "SYSTEM_SELECT";
    userId = undefined;
    username = undefined;
    practiceCount = 0;
    isAuthenticated = false;
    console.log(`[DuelState] Hard refresh detected, going to SYSTEM_SELECT`);
    return flowState;
  }

  // Check for persisted side from localStorage
  const storedSide = localStorage.getItem(STORAGE_KEY_SIDE) as DuelSide | null;

  if (storedSide === "L" || storedSide === "R") {
    // Side was previously selected - go to OTP
    side = storedSide;
    flowState = "OTP";
    console.log(
      `[DuelState] Found persisted side: ${storedSide}, starting at OTP`,
    );
  } else {
    // No side selected - go to system select
    side = undefined;
    flowState = "SYSTEM_SELECT";
    console.log(`[DuelState] No persisted side, starting at SYSTEM_SELECT`);
  }

  // Always reset authentication state - must re-authenticate each session
  userId = undefined;
  username = undefined;
  practiceCount = 0;
  isAuthenticated = false;

  return flowState;
}

/**
 * Restore state from a reconnection that preserved auth/practice on the server.
 */
export function restoreState(
  restoredPracticeCount: number,
  restoredUserId: string,
  restoredUsername: string,
): void {
  userId = restoredUserId;
  username = restoredUsername;
  practiceCount = restoredPracticeCount;
  isAuthenticated = true;

  // Determine the correct flow state based on practice progress
  if (restoredPracticeCount >= 2) {
    flowState = "LOBBY";
  } else if (restoredPracticeCount === 1) {
    flowState = "PRACTICE_2";
  } else {
    flowState = "PRACTICE_1";
  }

  updateBodyClass();
  console.log(
    `[DuelState] Restored state: ${restoredUsername}, practice=${restoredPracticeCount}, flowState=${flowState}`,
  );
}

// --- State Queries ---
export function isInDuelFlow(): boolean {
  return (
    flowState !== "SYSTEM_SELECT" &&
    flowState !== "OTP" &&
    flowState !== "EULA" &&
    flowState !== "RESULTS"
  );
}

export function isPracticing(): boolean {
  return flowState === "PRACTICE_1" || flowState === "PRACTICE_2";
}

export function isShowingResult(): boolean {
  return flowState === "RESULT_1" || flowState === "RESULT_2";
}

export function isRacing(): boolean {
  return flowState === "RACING";
}

export function shouldBlockUI(): boolean {
  return isPracticing() || isShowingResult() || isRacing();
}

export function shouldBlockRestart(): boolean {
  return isPracticing() || isShowingResult() || isRacing();
}

export function shouldBlockNavigation(): boolean {
  // Block navigation for all states except SYSTEM_SELECT (haven't started yet)
  return flowState !== "SYSTEM_SELECT";
}

// --- Waiting page message ---
let waitingPageMessage: string | undefined;

export function setWaitingPageMessage(msg: string): void {
  waitingPageMessage = msg;
}

export function consumeWaitingPageMessage(): string | undefined {
  const msg = waitingPageMessage;
  waitingPageMessage = undefined;
  return msg;
}

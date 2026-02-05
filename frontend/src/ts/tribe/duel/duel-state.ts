// Duel client state management
// Handles side persistence, flow state, and authentication status

// --- Types ---
export type DuelSide = "L" | "R";

export type DuelFlowState =
  | "SYSTEM_SELECT" // Choosing L or R
  | "OTP" // Entering OTP
  | "PRACTICE_1" // First practice (30 sec)
  | "RESULT_1" // Showing result for 5 sec
  | "COUNTDOWN_1" // 15 sec countdown before practice 2
  | "PRACTICE_2" // Second practice (60 sec)
  | "RESULT_2" // Showing result for 5 sec
  | "COUNTDOWN_2" // 15 sec countdown before lobby
  | "LOBBY" // Waiting in lobby
  | "RACING" // Active duel
  | "RESULTS"; // Viewing final results

// --- Constants ---
const STORAGE_KEY_SIDE = "duel_side";

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
}

export function setAuthenticated(newUserId: string, newUsername: string): void {
  userId = newUserId;
  username = newUsername;
  isAuthenticated = true;
  console.log(`[DuelState] Authenticated as: ${newUsername} (${newUserId})`);
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
  console.log(`[DuelState] Side cleared`);
}

export function resetToOtp(): void {
  userId = undefined;
  username = undefined;
  practiceCount = 0;
  isAuthenticated = false;
  flowState = "OTP";
  console.log(`[DuelState] Reset to OTP`);
}

export function fullReset(): void {
  clearSide();
  resetToOtp();
  document.body.classList.remove("duelFlowActive");
  console.log(`[DuelState] Full reset`);
}

// --- Initialization ---
export function initDuelState(): DuelFlowState {
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

// --- State Queries ---
export function isInDuelFlow(): boolean {
  return (
    flowState !== "SYSTEM_SELECT" &&
    flowState !== "OTP" &&
    flowState !== "RESULTS"
  );
}

export function isPracticing(): boolean {
  return flowState === "PRACTICE_1" || flowState === "PRACTICE_2";
}

export function isInCountdown(): boolean {
  return flowState === "COUNTDOWN_1" || flowState === "COUNTDOWN_2";
}

export function isShowingResult(): boolean {
  return flowState === "RESULT_1" || flowState === "RESULT_2";
}

export function isRacing(): boolean {
  return flowState === "RACING";
}

export function shouldBlockUI(): boolean {
  // Block UI (retry buttons, etc.) during practice, result viewing, countdowns, and racing
  // This blocks manual restarts/retries but doesn't prevent the test from being initialized
  return isPracticing() || isShowingResult() || isInCountdown() || isRacing();
}

export function shouldBlockRestart(): boolean {
  // Block restarts during practice, result viewing, countdowns, and racing
  // But allow the initial test initialization with tribeOverride
  return isPracticing() || isShowingResult() || isInCountdown() || isRacing();
}

// Duel Flow Controller
// Orchestrates the entire duel flow from system selection to race completion

import * as Notifications from "../../elements/notifications";
import * as DuelState from "./duel-state";
import * as DuelTimeSync from "./duel-time-sync";
import * as TribePages from "../tribe-pages";
import * as TribePagePreloader from "../pages/tribe-page-preloader";
import * as TribePageSystem from "../pages/tribe-page-system";
import * as TribePageOtp from "../pages/tribe-page-otp";
import * as NavigationEvent from "../../observables/navigation-event";
import * as TimerEvent from "../../observables/timer-event";
import * as UpdateConfig from "../../config";
import * as Random from "../../utils/random";
import TribeSocket from "../tribe-socket";
import type { DuelSide } from "./duel-state";

// ===========================================
// TOGGLE THESE FOR TESTING (set to 5 for quick tests, 30/60 for production)
// ===========================================
const PRACTICE_1_DURATION_SECONDS = 5; // Production: 30
const PRACTICE_2_DURATION_SECONDS = 5; // Production: 60
const RACE_DURATION_SECONDS = 5; // Production: 30
// ===========================================

// Constants
const PRACTICE_COUNT_REQUIRED = 2;
const COUNTDOWN_BETWEEN_TESTS_SECONDS = 10;
const COUNTDOWN_TO_LOBBY_SECONDS = 10;

// Callbacks for external integration
let onConnectedCallback: (() => void | Promise<void>) | undefined;

/**
 * Initialize the duel flow.
 * Checks for persisted side and navigates to appropriate page.
 */
export async function init(): Promise<void> {
  console.log("[DuelFlow] Initializing...");

  // Initialize state (checks localStorage for side)
  const initialState = DuelState.initDuelState();

  // Initialize page modules
  TribePageSystem.init(handleSideSelect);
  TribePageOtp.init(handleAuthenticate);

  // Navigate based on initial state
  if (initialState === "OTP") {
    // Side already selected, go to OTP
    TribePageOtp.updateSideLabel();
    await TribePages.change("otp");
    TribePageOtp.focusInput();

    // Connect socket and register side
    onConnectedCallback = async (): Promise<void> => {
      await onSocketConnectedForOtp();
    };
    TribeSocket.connect();
  } else {
    // No side selected, show system select
    await TribePages.change("system");
  }

  console.log(`[DuelFlow] Initialized at state: ${initialState}`);
}

/**
 * Called when socket connects and we already have a side (from localStorage).
 * Register side and stay on OTP page.
 */
async function onSocketConnectedForOtp(): Promise<void> {
  console.log("[DuelFlow] Socket connected for OTP flow");

  const side = DuelState.getSide();
  if (!side) {
    console.error("[DuelFlow] No side set");
    DuelState.clearSide();
    TribePageSystem.reset();
    void TribePages.change("system");
    return;
  }

  // Register our side with the server
  const result = await TribeSocket.out.duel.registerSystem(side);

  if (!result.ok) {
    // If side is taken, go back to system select
    if (
      result.error?.includes("already registered") ||
      result.error?.includes("occupied")
    ) {
      Notifications.add(result.error ?? "Side already taken", -1);
      DuelState.clearSide();
      TribePageSystem.reset();
      void TribePages.change("system");
    } else {
      // Show error on OTP page
      TribePageOtp.showError(result.error ?? "Failed to register side");
    }
    return;
  }

  // Perform time sync
  await DuelTimeSync.sync();

  // Stay on OTP page, ready for authentication
  console.log("[DuelFlow] Registered side, waiting for OTP");
}

/**
 * Handle side selection (L or R).
 */
async function handleSideSelect(side: DuelSide): Promise<void> {
  console.log(`[DuelFlow] Side selected: ${side}`);

  TribePageSystem.disable();
  TribePagePreloader.updateText("Connecting...");
  await TribePages.change("preloader");

  // Set side in state (persists to localStorage)
  DuelState.setSide(side);

  // Now connect the socket and register
  onConnectedCallback = async (): Promise<void> => {
    await onSocketConnected();
  };

  TribeSocket.connect();
}

/**
 * Handle OTP authentication submission.
 * Returns true if successful, false otherwise.
 */
async function handleAuthenticate(otp: string): Promise<boolean> {
  console.log(`[DuelFlow] Authenticating with OTP...`);

  TribePageOtp.hideError();

  // If not connected, connect first
  if (!TribeSocket.getId()) {
    TribePageOtp.setLoading(true);

    onConnectedCallback = async (): Promise<void> => {
      // After connect, register side and then authenticate
      const side = DuelState.getSide();
      if (!side) {
        TribePageOtp.showError("No side selected");
        TribePageOtp.setLoading(false);
        return;
      }

      // Register side
      const registerResult = await TribeSocket.out.duel.registerSystem(side);
      if (!registerResult.ok) {
        TribePageOtp.showError(
          registerResult.error ?? "Failed to register side",
        );
        TribePageOtp.setLoading(false);
        return;
      }

      // Perform time sync
      await DuelTimeSync.sync();

      // Now authenticate
      const result = await doAuthenticate(otp);
      TribePageOtp.setLoading(false);
      if (result) {
        await startPracticeFlow();
      }
    };

    TribeSocket.connect();
    return false; // Will continue in callback
  }

  // Already connected, just authenticate
  const result = await doAuthenticate(otp);
  if (result) {
    await startPracticeFlow();
  }
  return result;
}

/**
 * Perform the actual authentication call.
 */
async function doAuthenticate(otp: string): Promise<boolean> {
  const response = await TribeSocket.out.duel.authenticate(otp);

  if (!response.ok) {
    TribePageOtp.showError(response.error ?? "Authentication failed");
    return false;
  }

  // Extract user info from response data
  const data = response.data as
    | { userId: string; username: string }
    | undefined;
  if (data) {
    DuelState.setAuthenticated(data.userId, data.username);
  }

  return true;
}

/**
 * Called when socket connects successfully.
 */
async function onSocketConnected(): Promise<void> {
  console.log("[DuelFlow] Socket connected");

  const side = DuelState.getSide();
  if (!side) {
    console.error("[DuelFlow] No side set after connect");
    void TribePages.change("system");
    return;
  }

  // Register our side with the server
  const result = await TribeSocket.out.duel.registerSystem(side);

  if (!result.ok) {
    Notifications.add(result.error ?? "Failed to register side", -1);

    // If side is taken, go back to system select
    if (
      result.error?.includes("already registered") ||
      result.error?.includes("occupied")
    ) {
      DuelState.clearSide();
      TribePageSystem.reset();
      void TribePages.change("system");
    } else {
      // Other error, stay at preloader with reconnect option
      TribePagePreloader.updateText("Registration failed");
      TribePagePreloader.updateSubtext(result.error ?? "Unknown error");
      TribePagePreloader.showReconnectButton();
    }
    return;
  }

  // Perform time sync
  await DuelTimeSync.sync();

  // Navigate to OTP page
  TribePageOtp.updateSideLabel();
  await TribePages.change("otp");
  TribePageOtp.focusInput();
}

/**
 * Start the practice flow (2 practice runs).
 */
async function startPracticeFlow(): Promise<void> {
  console.log("[DuelFlow] Starting practice flow");

  const practiceNum = DuelState.getPracticeCount() + 1;
  const isPractice1 = practiceNum === 1;
  const duration = isPractice1
    ? PRACTICE_1_DURATION_SECONDS
    : PRACTICE_2_DURATION_SECONDS;

  DuelState.setFlowState(isPractice1 ? "PRACTICE_1" : "PRACTICE_2");

  // Configure for time mode with appropriate duration
  UpdateConfig.setConfig("mode", "time", { nosave: true });
  UpdateConfig.setConfig("time", duration, { nosave: true });
  UpdateConfig.setConfig("language", "english", { nosave: true });
  UpdateConfig.setConfig("numbers", false, { nosave: true });
  UpdateConfig.setConfig("punctuation", false, { nosave: true });

  // Show practice notification
  Notifications.add(
    `Practice ${practiceNum}/${PRACTICE_COUNT_REQUIRED} (${duration}s)`,
    1,
    {
      customTitle: "Duel",
      duration: 2,
    },
  );

  // Navigate to test page
  NavigationEvent.dispatch("/", {
    tribeOverride: true,
    force: true,
  });
}

/**
 * Called when a practice test is completed.
 * Should be hooked into the test completion flow.
 * Flow: Test ends → Show result with countdown below → Next action
 */
export async function onPracticeComplete(): Promise<void> {
  const currentState = DuelState.getFlowState();

  if (currentState !== "PRACTICE_1" && currentState !== "PRACTICE_2") {
    console.log(
      "[DuelFlow] onPracticeComplete called but not in practice state",
    );
    return;
  }

  const isPractice1 = currentState === "PRACTICE_1";

  // Increment practice count
  const count = DuelState.incrementPractice();

  // Notify server (fire and forget - don't block on response)
  TribeSocket.out.duel.practiceComplete().catch((err: unknown) => {
    console.warn(
      "[DuelFlow] Failed to notify server of practice complete:",
      err,
    );
  });

  console.log(
    `[DuelFlow] Practice ${count}/${PRACTICE_COUNT_REQUIRED} completed`,
  );

  // Set result viewing state
  DuelState.setFlowState(isPractice1 ? "RESULT_1" : "RESULT_2");

  // Show countdown immediately below results
  if (count < PRACTICE_COUNT_REQUIRED) {
    // Countdown then start practice 2
    startCountdownBelowResults(
      "Next test starts in",
      COUNTDOWN_BETWEEN_TESTS_SECONDS,
      async () => {
        hideCountdownBelowResults();
        await startPracticeFlow();
      },
    );
  } else {
    // Countdown then join lobby
    startCountdownBelowResults(
      "Joining lobby in",
      COUNTDOWN_TO_LOBBY_SECONDS,
      async () => {
        hideCountdownBelowResults();
        await joinDuelLobby();
      },
    );
  }
}

// Countdown elements
let countdownInterval: ReturnType<typeof setInterval> | undefined;

/**
 * Show countdown below the results (not a blocking overlay).
 */
function startCountdownBelowResults(
  message: string,
  seconds: number,
  onComplete: () => void,
): void {
  console.log(`[DuelFlow] Starting ${seconds}s countdown below results`);

  // Clear any existing interval
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  // Create countdown element if it doesn't exist
  let countdown = document.getElementById("duelResultCountdown");
  if (!countdown) {
    countdown = document.createElement("div");
    countdown.id = "duelResultCountdown";
    countdown.innerHTML = `
      <div class="duelCountdownMessage"></div>
      <div class="duelCountdownTimer"></div>
    `;
  }

  const messageEl = countdown.querySelector(
    ".duelCountdownMessage",
  ) as HTMLElement;
  const timerEl = countdown.querySelector(".duelCountdownTimer") as HTMLElement;

  messageEl.textContent = message;
  timerEl.textContent = `${seconds}`;

  // Insert into result page bottom area
  const resultBottom = document.querySelector("#result .buttons");
  if (resultBottom) {
    resultBottom.insertAdjacentElement("afterend", countdown);
  } else {
    // Fallback: append to result page
    const resultPage = document.querySelector("#result");
    if (resultPage) {
      resultPage.appendChild(countdown);
    }
  }

  countdown.classList.add("active");

  let remaining = seconds;

  countdownInterval = setInterval(() => {
    remaining--;
    timerEl.textContent = `${remaining}`;

    if (remaining <= 0) {
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = undefined;
      }
      onComplete();
    }
  }, 1000);
}

/**
 * Hide the countdown below results.
 */
function hideCountdownBelowResults(): void {
  const countdown = document.getElementById("duelResultCountdown");
  if (countdown) {
    countdown.classList.remove("active");
    countdown.remove();
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = undefined;
  }
}

/**
 * Join the duel lobby after practice is complete.
 */
async function joinDuelLobby(): Promise<void> {
  console.log("[DuelFlow] Joining duel lobby");

  DuelState.setFlowState("LOBBY");

  // Notify server we're ready for lobby (fire and forget)
  TribeSocket.out.duel
    .joinLobby()
    .then((response) => {
      if (!response.ok) {
        console.warn("[DuelFlow] Join lobby response:", response.error);
      }
    })
    .catch((err: unknown) => {
      console.warn("[DuelFlow] Failed to notify server of join lobby:", err);
    });

  // Show waiting notification
  Notifications.add("Practice complete! Joining lobby...", 1, {
    customTitle: "Duel",
    duration: 3,
  });

  // Navigate back to tribe page with lobby view
  NavigationEvent.dispatch("/tribe", {
    tribeOverride: true,
  });
}

/**
 * Handle opponent joined event.
 */
export function onOpponentJoined(username: string, side: DuelSide): void {
  console.log(`[DuelFlow] Opponent joined: ${username} (${side})`);

  Notifications.add(`${username} joined as System ${side}`, 1, {
    customTitle: "Duel",
    duration: 2,
  });
}

/**
 * Handle opponent left event.
 */
export function onOpponentLeft(side: DuelSide): void {
  console.log(`[DuelFlow] Opponent left: ${side}`);

  Notifications.add(`System ${side} disconnected`, -1, {
    customTitle: "Duel",
    duration: 3,
  });

  // If we're in lobby or racing, reset to lobby waiting state
  const state = DuelState.getFlowState();
  if (state === "LOBBY" || state === "RACING") {
    DuelState.setFlowState("LOBBY");
    Notifications.add("Waiting for opponent...", 1, {
      customTitle: "Duel",
      duration: 3,
    });
  }
}

// Constants for race scheduling
const WAITING_PAGE_DURATION_MS = 5000; // 5 seconds on waiting page

/**
 * Handle race scheduled event with synchronized start time.
 * Shows waiting page for 5 seconds, then test page with countdown.
 */
export function onRaceScheduled(startAt: number, seed: number): void {
  console.log(`[DuelFlow] Race scheduled for ${startAt}, seed: ${seed}`);

  // Set state to RACING
  DuelState.setFlowState("RACING");

  // Mark self as typing and set room state to RACE_ONGOING
  // This is required for input to work (keydown handler checks isRaceActive)
  void import("../tribe-state").then((TribeState) => {
    const room = TribeState.getRoom();
    if (room) {
      room.state = "RACE_ONGOING";
      console.log("[DuelFlow] Set room.state = RACE_ONGOING");
    }

    const self = TribeState.getSelf();
    if (self) {
      self.isTyping = true;
      self.isFinished = false;
      console.log("[DuelFlow] Set self.isTyping = true");
    } else {
      console.warn("[DuelFlow] Could not find self in TribeState");
    }
  });

  // Set seed for deterministic words
  Random.setSeed(seed.toString());

  // Configure race settings BEFORE navigation
  // This ensures words are generated with correct config
  UpdateConfig.setConfig("mode", "time", { nosave: true });
  UpdateConfig.setConfig("time", RACE_DURATION_SECONDS, { nosave: true });
  UpdateConfig.setConfig("language", "english", { nosave: true });
  UpdateConfig.setConfig("numbers", false, { nosave: true });
  UpdateConfig.setConfig("punctuation", false, { nosave: true });

  // Navigate to waiting page first
  NavigationEvent.dispatch("/waiting", {
    tribeOverride: true,
    force: true,
  });

  // Update waiting page message
  setTimeout(() => {
    const messageEl = document.querySelector(".pageWaiting .message");
    if (messageEl) {
      messageEl.textContent = "Get ready...";
    }
  }, 100);

  // After waiting page duration, navigate to test page
  setTimeout(() => {
    navigateToTestAndStartCountdown(startAt);
  }, WAITING_PAGE_DURATION_MS);
}

/**
 * Navigate to test page and start countdown timer.
 */
function navigateToTestAndStartCountdown(startAt: number): void {
  console.log("[DuelFlow] Navigating to test page...");

  NavigationEvent.dispatch("/", {
    tribeOverride: true,
    force: true,
  });

  // Wait a bit for page transition to complete, then start countdown
  // This ensures the test page is fully loaded with words visible
  setTimeout(() => {
    startRaceCountdown(startAt);
  }, 500); // Give page time to initialize
}

/**
 * Start the race countdown timer.
 */
function startRaceCountdown(startAt: number): void {
  import("../tribe-countdown")
    .then((TribeCountdown) => {
      TribeCountdown.show2();

      // Calculate initial countdown value
      const now = DuelTimeSync.getServerNow();
      let remaining = Math.ceil((startAt - now) / 1000);

      // Safety check - if time already passed, start immediately
      if (remaining <= 0) {
        console.log(
          "[DuelFlow] Race start time already passed, starting immediately!",
        );
        TribeCountdown.hide2();
        startDuelRace();
        return;
      }

      console.log(`[DuelFlow] Countdown starting: ${remaining}s until race`);
      TribeCountdown.update2(remaining.toString());

      // Update countdown every 100ms for smooth display
      const countdownInterval = setInterval(() => {
        const currentTime = DuelTimeSync.getServerNow();
        remaining = Math.ceil((startAt - currentTime) / 1000);

        if (remaining <= 0) {
          clearInterval(countdownInterval);
          TribeCountdown.hide2();
          console.log("[DuelFlow] Starting race now!");
          startDuelRace();
        } else {
          TribeCountdown.update2(remaining.toString());
        }
      }, 100);
    })
    .catch((err: unknown) => {
      console.error("[DuelFlow] Failed to load countdown module:", err);
      // Fallback: just start the race
      startDuelRace();
    });
}

/**
 * Actually start the duel race - focus input and dispatch start event.
 */
function startDuelRace(): void {
  // Set user as typing in TribeState so input isn't blocked
  void import("../tribe-state").then((TribeState) => {
    const self = TribeState.getSelf();
    if (self) {
      self.isTyping = true;
      self.isFinished = false;
    }
  });

  // Focus the input element so user can type
  void import("../../test/test-ui").then((TestUI) => {
    TestUI.focusWords(true);
  });

  // Dispatch start event to begin the test
  TimerEvent.dispatch("start");
}

/**
 * Handle duel race completed.
 */
export function onDuelRaceComplete(): void {
  console.log("[DuelFlow] Duel race completed");

  DuelState.setFlowState("RESULTS");

  // Results will be shown through normal tribe result flow
}

/**
 * Check if we're currently in the duel flow (not at system/otp screens).
 */
export function isInDuelFlow(): boolean {
  return DuelState.isInDuelFlow();
}

/**
 * Check if currently doing practice.
 */
export function isPracticing(): boolean {
  return DuelState.isPracticing();
}

/**
 * Check if currently in a duel race.
 */
export function isRacing(): boolean {
  return DuelState.isRacing();
}

/**
 * Full reset - clears everything including localStorage.
 */
export function fullReset(): void {
  DuelState.fullReset();
  DuelTimeSync.reset();
  TribePageSystem.reset();
  TribePageOtp.reset();
}

/**
 * Reset to OTP page (keeps side).
 */
export function resetToOtp(): void {
  DuelState.resetToOtp();
  DuelTimeSync.reset();
  TribePageOtp.reset();
  void TribePages.change("otp");
}

// --- Socket Event Handlers ---
// These should be registered when socket connects

export function registerSocketHandlers(): void {
  // Opponent events
  TribeSocket.in.duel.opponentJoined((data) => {
    onOpponentJoined(data.username, data.side);
  });

  TribeSocket.in.duel.opponentLeft((data) => {
    onOpponentLeft(data.side);
  });

  // Race scheduled with startAt
  TribeSocket.in.duel.raceScheduled((data) => {
    onRaceScheduled(data.startAt, data.seed);
  });
}

// --- Integration Point for System Connection ---

TribeSocket.in.system.connect(() => {
  if (onConnectedCallback) {
    const result = onConnectedCallback();
    if (result instanceof Promise) {
      void result;
    }
    onConnectedCallback = undefined;
  }
});

TribeSocket.in.system.disconnect(() => {
  // On disconnect during duel flow, show preloader with reconnect
  const state = DuelState.getFlowState();
  if (state !== "SYSTEM_SELECT") {
    TribePagePreloader.updateText("Disconnected");
    TribePagePreloader.updateSubtext("Connection lost");
    TribePagePreloader.showReconnectButton();
    void TribePages.change("preloader");
  }
});

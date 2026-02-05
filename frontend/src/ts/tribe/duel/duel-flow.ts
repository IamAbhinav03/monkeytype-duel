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
import * as TribeSound from "../tribe-sound";
import type { DuelSide } from "./duel-state";

// Production durations (overridable by server for race via duel_race_scheduled)
const PRACTICE_1_DURATION_SECONDS = 60; // Test 1: 1 minute
const PRACTICE_2_DURATION_SECONDS = 30; // Test 2: 30 seconds
let raceDurationSeconds = 30; // Updated from server's duel_race_scheduled event

// Constants
const PRACTICE_COUNT_REQUIRED = 2;
const COUNTDOWN_BETWEEN_TESTS_SECONDS = 5;
const COUNTDOWN_TO_LOBBY_SECONDS = 5;

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
 * Register side and stay on OTP page — or skip OTP if server preserved auth.
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

  // Check if server preserved auth from a previous session (reconnect)
  const data = result.data as
    | {
        wasAuthenticated?: boolean;
        practiceCount?: number;
        username?: string;
        userId?: string;
      }
    | undefined;

  if (
    data?.wasAuthenticated === true &&
    data.username !== undefined &&
    data.username !== "" &&
    data.userId !== undefined &&
    data.userId !== ""
  ) {
    console.log(
      `[DuelFlow] Reconnected with preserved auth: ${data.username}, practice=${data.practiceCount}`,
    );
    DuelState.restoreState(data.practiceCount ?? 0, data.userId, data.username);

    // Resume from correct flow state
    const practiceCount = data.practiceCount ?? 0;
    if (practiceCount >= 2) {
      await joinDuelLobby();
    } else {
      await startPracticeFlow();
    }
    return;
  }

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
        await showEulaPage();
      }
    };

    TribeSocket.connect();
    return false; // Will continue in callback
  }

  // Already connected, just authenticate
  const result = await doAuthenticate(otp);
  if (result) {
    await showEulaPage();
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

// --- EULA Page ---

const EULA_DURATION_SECONDS = 5;

/**
 * Show EULA/terms page for 10 seconds, then auto-advance to practice flow.
 */
async function showEulaPage(): Promise<void> {
  console.log("[DuelFlow] Showing EULA page");
  DuelState.setFlowState("EULA");

  // Navigate to tribe page to show the EULA tribePage
  NavigationEvent.dispatch("/tribe", { tribeOverride: true });

  // Wait for page transition, then switch to EULA tribePage
  setTimeout(() => {
    void TribePages.change("eula");
  }, 100);

  // Start countdown on EULA page
  let remaining = EULA_DURATION_SECONDS;

  const eulaInterval = setInterval(() => {
    remaining--;
    const timerEl = document.querySelector(".eulaCountdownTimer");
    if (timerEl) {
      timerEl.textContent = `${remaining}`;
    }

    if (remaining <= 0) {
      clearInterval(eulaInterval);
      void startPracticeFlow();
    }
  }, 1000);
}

// --- Duel Banner ---

function showDuelBanner(text: string): void {
  let banner = document.getElementById("duelBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "duelBanner";
    const testArea = document.querySelector("#typingTest");
    if (testArea) {
      testArea.insertBefore(banner, testArea.firstChild);
    }
  }
  banner.innerHTML = text;
  banner.classList.add("active");
}

function hideDuelBanner(): void {
  const banner = document.getElementById("duelBanner");
  if (banner) {
    banner.classList.remove("active");
  }
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

  // Show banner on test page after navigation
  const bannerName = DuelState.getUsername() ?? DuelState.getSide() ?? "?";
  setTimeout(() => {
    showDuelBanner(
      `<span class="duelBannerSide">${bannerName}</span> &mdash; Warm-Up ${practiceNum} of ${PRACTICE_COUNT_REQUIRED} &mdash; ${duration}s`,
    );
  }, 300);

  // Show practice notification
  Notifications.add(
    `Warm-Up ${practiceNum}/${PRACTICE_COUNT_REQUIRED} (${duration}s)`,
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

  // Hide banner on result page
  hideDuelBanner();

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

  // Join lobby on server — wait for response so room is set up before navigating
  try {
    const response = await TribeSocket.out.duel.joinLobby();
    if (!response.ok) {
      console.warn("[DuelFlow] Join lobby response:", response.error);
    }
  } catch (err: unknown) {
    console.warn("[DuelFlow] Failed to notify server of join lobby:", err);
  }

  // Navigate back to tribe page with lobby view
  NavigationEvent.dispatch("/tribe", {
    tribeOverride: true,
  });

  // Set up the duel lobby UI after navigation
  setTimeout(() => {
    setupDuelLobby();
  }, 300);
}

/**
 * Set up the duel lobby header with room ID, participants, and status.
 */
function setupDuelLobby(): void {
  const lobby = document.querySelector(".pageTribe .tribePage.lobby");
  if (!lobby) return;

  // Remove existing duel header if any
  const existing = lobby.querySelector(".duelLobbyHeader");
  if (existing) existing.remove();

  // Get room info
  const TribeState = getTribeStateSync();
  const room = TribeState?.getRoom();
  const roomId = room?.id ?? "---";
  const users = room?.users ?? {};
  const userCount = Object.keys(users).length;

  const header = document.createElement("div");
  header.className = "duelLobbyHeader";

  // Build participant cards
  let participantsHTML = "";
  for (const user of Object.values(users)) {
    const isMe = user.id === TribeSocket.getId();
    participantsHTML += `
      <div class="duelParticipant ${isMe ? "me" : "opponent"}">
        <div class="duelParticipantIcon">
          <i class="fas fa-${isMe ? "user" : "user-friends"}"></i>
        </div>
        <div class="duelParticipantName">${user.name}</div>
        <div class="duelParticipantTag">${isMe ? "You" : "Opponent"}</div>
      </div>
    `;
  }

  // Add empty slot if waiting for opponent
  if (userCount < 2) {
    participantsHTML += `
      <div class="duelParticipant waiting">
        <div class="duelParticipantIcon">
          <i class="fas fa-circle-notch fa-spin"></i>
        </div>
        <div class="duelParticipantName">Waiting...</div>
        <div class="duelParticipantTag">Opponent</div>
      </div>
    `;
  }

  const statusText =
    userCount >= 2
      ? "Both players ready — race starting soon!"
      : "Waiting for opponent to finish practice...";

  header.innerHTML = `
    <div class="duelLobbyTitle">Duel Lobby</div>
    <div class="duelLobbyRoomId">Room: <span>${roomId}</span></div>
    <div class="duelLobbyParticipants">${participantsHTML}</div>
    <div class="duelLobbyStatus">${statusText}</div>
  `;

  lobby.prepend(header);
}

/**
 * Get TribeState synchronously (already imported in module scope).
 */
let _tribeStateCache: typeof import("../tribe-state") | undefined;

function getTribeStateSync(): typeof import("../tribe-state") | undefined {
  if (_tribeStateCache) return _tribeStateCache;
  // Lazy load — first call returns undefined, subsequent calls return cached
  void import("../tribe-state").then((mod) => {
    _tribeStateCache = mod;
  });
  return undefined;
}

// Pre-load TribeState at module init
void import("../tribe-state").then((mod) => {
  _tribeStateCache = mod;
});

/**
 * Handle opponent joined event.
 */
export function onOpponentJoined(username: string, _side: DuelSide): void {
  console.log(`[DuelFlow] Opponent joined: ${username}`);

  Notifications.add(`${username} joined`, 1, {
    customTitle: "Duel",
    duration: 2,
  });

  // Refresh the lobby UI to show the new participant
  if (DuelState.getFlowState() === "LOBBY") {
    setupDuelLobby();
  }
}

/**
 * Handle opponent left event.
 */
export function onOpponentLeft(_side: DuelSide): void {
  console.log("[DuelFlow] Opponent left");

  Notifications.add("Opponent disconnected", -1, {
    customTitle: "Duel",
    duration: 3,
  });

  // If we're in lobby or racing, reset to lobby waiting state
  const state = DuelState.getFlowState();
  if (state === "LOBBY" || state === "RACING") {
    DuelState.setFlowState("LOBBY");

    // Refresh the lobby UI
    if (state === "LOBBY") {
      setupDuelLobby();
    }
  }
}

// Constants for race scheduling
const WAITING_PAGE_DURATION_MS = 5000; // 5 seconds on waiting page

/**
 * Handle race scheduled event with synchronized start time.
 * Shows waiting page for 5 seconds, then test page with countdown.
 */
export function onRaceScheduled(
  startAt: number,
  seed: number,
  serverRaceDuration?: number,
): void {
  console.log(`[DuelFlow] Race scheduled for ${startAt}, seed: ${seed}`);

  // Use server-provided race duration if available
  if (serverRaceDuration !== undefined && serverRaceDuration > 0) {
    raceDurationSeconds = serverRaceDuration;
    console.log(
      `[DuelFlow] Using server race duration: ${raceDurationSeconds}s`,
    );
  }

  // Set state to RACING
  DuelState.setFlowState("RACING");

  // Mark self as typing and set room state to RACE_ONGOING
  // This is required for input to work (keydown handler checks isRaceActive)
  // Set room to RACE_COUNTDOWN during the waiting/countdown phase.
  // Typing is NOT enabled yet — that happens in startDuelRace() after countdown reaches 0.
  void import("../tribe-state").then((TribeState) => {
    const room = TribeState.getRoom();
    if (room) {
      room.state = "RACE_COUNTDOWN";
      console.log(
        "[DuelFlow] Set room.state = RACE_COUNTDOWN (typing blocked)",
      );
    }

    const self = TribeState.getSelf();
    if (self) {
      self.isTyping = false;
      self.isFinished = false;
      console.log(
        "[DuelFlow] Set self.isTyping = false (waiting for countdown)",
      );
    } else {
      console.warn("[DuelFlow] Could not find self in TribeState");
    }
  });

  // Set seed for deterministic words
  Random.setSeed(seed.toString());

  // Configure race settings BEFORE navigation
  // This ensures words are generated with correct config
  UpdateConfig.setConfig("mode", "time", { nosave: true });
  UpdateConfig.setConfig("time", raceDurationSeconds, { nosave: true });
  UpdateConfig.setConfig("language", "english", { nosave: true });
  UpdateConfig.setConfig("numbers", false, { nosave: true });
  UpdateConfig.setConfig("punctuation", false, { nosave: true });

  // Set waiting page message via DuelState — the waiting page's afterShow reads it
  DuelState.setWaitingPageMessage("Get ready...");

  // Navigate to waiting page first
  NavigationEvent.dispatch("/waiting", {
    tribeOverride: true,
    force: true,
  });

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

  // Show race banner
  const bannerName = DuelState.getUsername() ?? DuelState.getSide() ?? "?";
  setTimeout(() => {
    showDuelBanner(
      `<span class="duelBannerSide">${bannerName}</span> &mdash; DUEL RACE &mdash; ${raceDurationSeconds}s`,
    );
  }, 300);

  // Wait for page to load, then verify #words element exists before starting countdown
  waitForWordsAndStartCountdown(startAt, 0);
}

/**
 * Wait for #words element to exist before starting countdown.
 * Retries up to 10 times (every 100ms) after an initial 800ms wait.
 */
function waitForWordsAndStartCountdown(startAt: number, attempt: number): void {
  const delay = attempt === 0 ? 800 : 100;
  const maxAttempts = 10;

  setTimeout(() => {
    const wordsEl = document.getElementById("words");
    if (wordsEl || attempt >= maxAttempts) {
      if (!wordsEl) {
        console.warn(
          "[DuelFlow] #words element not found after retries, starting countdown anyway",
        );
      }
      startRaceCountdown(startAt);
    } else {
      waitForWordsAndStartCountdown(startAt, attempt + 1);
    }
  }, delay);
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

      // Play initial countdown tick
      if (remaining <= 5) {
        TribeSound.play("cd");
      }

      let lastPlayedSecond = remaining;

      // Update countdown every 100ms for smooth display
      const countdownInterval = setInterval(() => {
        const currentTime = DuelTimeSync.getServerNow();
        remaining = Math.ceil((startAt - currentTime) / 1000);

        if (remaining <= 0) {
          clearInterval(countdownInterval);
          TribeCountdown.hide2();
          TribeSound.play("cd_go");
          console.log("[DuelFlow] Starting race now!");
          startDuelRace();
        } else {
          TribeCountdown.update2(remaining.toString());
          // Play tick sound on each new second (only for last 5 seconds)
          if (remaining !== lastPlayedSecond && remaining <= 5) {
            lastPlayedSecond = remaining;
            TribeSound.play("cd");
          }
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
 * This is called AFTER the countdown reaches 0.
 */
function startDuelRace(): void {
  // NOW enable typing — set room state to RACE_ONGOING and isTyping = true
  void import("../tribe-state").then((TribeState) => {
    const room = TribeState.getRoom();
    if (room) {
      room.state = "RACE_ONGOING";
      console.log("[DuelFlow] Set room.state = RACE_ONGOING (typing enabled)");
    }

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

// Auto-advance timer
const AUTO_ADVANCE_SECONDS = 5;
let autoAdvanceInterval: ReturnType<typeof setInterval> | undefined;

/**
 * Handle duel race completed.
 */
export function onDuelRaceComplete(): void {
  console.log("[DuelFlow] Duel race completed");

  DuelState.setFlowState("RESULTS");
  hideDuelBanner();

  // Show auto-advance button below results after a short delay
  setTimeout(() => {
    showAutoAdvanceButton();
  }, 500);
}

/**
 * Show the auto-advance (skip) button on the results page.
 * Fills up over AUTO_ADVANCE_SECONDS, then auto-advances back to lobby/tribe.
 */
function showAutoAdvanceButton(): void {
  // Clean up any existing auto-advance
  hideAutoAdvanceButton();

  let container = document.getElementById("duelAutoAdvance");
  if (!container) {
    container = document.createElement("div");
    container.id = "duelAutoAdvance";
    container.innerHTML = `
      <button class="duelAutoAdvanceButton">
        <div class="duelAutoAdvanceFill"></div>
        <span class="duelAutoAdvanceLabel">Continue (${AUTO_ADVANCE_SECONDS}s)</span>
      </button>
    `;
  }

  // Insert after result buttons
  const resultBottom = document.querySelector("#result .buttons");
  if (resultBottom) {
    resultBottom.insertAdjacentElement("afterend", container);
  } else {
    const resultPage = document.querySelector("#result");
    if (resultPage) {
      resultPage.appendChild(container);
    }
  }

  container.classList.add("active");

  // These elements are guaranteed to exist since we just created them above
  const fillEl = container.querySelector(".duelAutoAdvanceFill") as HTMLElement;
  const labelEl = container.querySelector(
    ".duelAutoAdvanceLabel",
  ) as HTMLElement;
  const buttonEl = container.querySelector(
    ".duelAutoAdvanceButton",
  ) as HTMLElement;

  let elapsed = 0;
  const tickMs = 100;
  const totalMs = AUTO_ADVANCE_SECONDS * 1000;

  autoAdvanceInterval = setInterval(() => {
    elapsed += tickMs;
    const pct = Math.min((elapsed / totalMs) * 100, 100);
    fillEl.style.width = `${pct}%`;

    const remaining = Math.ceil((totalMs - elapsed) / 1000);
    labelEl.textContent = `Continue (${remaining}s)`;

    if (elapsed >= totalMs) {
      clearInterval(autoAdvanceInterval);
      autoAdvanceInterval = undefined;
      onAutoAdvance();
    }
  }, tickMs);

  // Allow manual skip on click
  buttonEl.addEventListener("click", () => {
    if (autoAdvanceInterval) {
      clearInterval(autoAdvanceInterval);
      autoAdvanceInterval = undefined;
    }
    onAutoAdvance();
  });
}

/**
 * Hide and clean up the auto-advance button.
 */
function hideAutoAdvanceButton(): void {
  if (autoAdvanceInterval) {
    clearInterval(autoAdvanceInterval);
    autoAdvanceInterval = undefined;
  }
  const container = document.getElementById("duelAutoAdvance");
  if (container) {
    container.classList.remove("active");
    container.remove();
  }
}

/**
 * Called when auto-advance triggers (either timeout or manual click).
 * Navigate back to tribe lobby.
 */
function onAutoAdvance(): void {
  console.log("[DuelFlow] Auto-advancing from results");
  hideAutoAdvanceButton();
  hideCountdownBelowResults();

  // Transition back to LOBBY state so the lobby page shows properly
  DuelState.setFlowState("LOBBY");

  // Navigate back to tribe page
  NavigationEvent.dispatch("/tribe", {
    tribeOverride: true,
  });

  // Set up the duel lobby UI after navigation
  setTimeout(() => {
    setupDuelLobby();
  }, 300);
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

// --- F5 / Hard Refresh Detection ---
// F5 or Ctrl+Shift+R sets a flag so initDuelState knows to go to SYSTEM_SELECT
const HARD_REFRESH_FLAG = "duel_hard_refresh";

window.addEventListener("keydown", (e) => {
  if (
    e.key === "F5" ||
    (e.ctrlKey && e.shiftKey && e.key === "R") ||
    (e.metaKey && e.shiftKey && e.key === "r")
  ) {
    const state = DuelState.getFlowState();
    if (state !== "SYSTEM_SELECT") {
      localStorage.setItem(HARD_REFRESH_FLAG, "true");
    }
  }
});

// --- Beforeunload Warning ---
// Warn user before closing tab during active duel (not during OTP/SYSTEM_SELECT)
window.addEventListener("beforeunload", (e) => {
  const state = DuelState.getFlowState();
  if (state !== "SYSTEM_SELECT" && state !== "OTP") {
    e.preventDefault();
  }
});

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
    onRaceScheduled(data.startAt, data.seed, data.raceDuration);
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

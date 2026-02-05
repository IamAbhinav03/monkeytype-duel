import Page from "./page";
import * as Tribe from "../tribe/tribe";
import * as TribeState from "../tribe/tribe-state";
import * as TribeChat from "../tribe/tribe-chat";
import { qsr } from "../utils/dom";
import { CLIENT_STATE } from "../tribe/types";
import tribeSocket from "../tribe/tribe-socket";
import * as TribePagePreloader from "../tribe/pages/tribe-page-preloader";
import * as TribePages from "../tribe/tribe-pages";
import { isDuelModeEnabled } from "../utils/tribe";
import * as DuelState from "../tribe/duel/duel-state";

/**
 * Tribe page configuration and lifecycle management.
 * Existing code, explaned using AI
 *
 * Handles the initialization and navigation flow for the tribe/multiplayer section.
 *
 * @remarks
 * - `beforeHide`: Executed immediately before the page is hidden from view. Use for cleanup
 *   that should occur before the page becomes invisible but while it's still in the DOM.
 * - `beforeShow`: Executed immediately before the page is shown to the user. Use for setup
 *   that must occur before rendering, such as loading data or initializing state.
 *
 * Key differences:
 * - `beforeHide` runs when navigating AWAY from the tribe page
 * - `beforeShow` runs when navigating TO the tribe page
 * - `beforeShow` restores chat state if the user is already in a room
 * - `afterHide` performs full cleanup (socket disconnect, preloader reset)
 * - `afterShow` initializes the tribe module if disconnected
 *
 * @example
 * // Page lifecycle order:
 * // 1. beforeShow (when entering tribe page)
 * // 2. afterShow (after page is rendered)
 * // 3. beforeHide (when leaving tribe page)
 * // 4. afterHide (after page is hidden)
 */
export const page = new Page({
  id: "tribe",
  element: qsr(".page.pageTribe"),
  path: "/tribe",
  beforeHide: async () => {
    // TODO: Fill it up later
  },
  afterHide: async () => {
    // In duel mode, keep socket connected during the entire duel flow
    if (
      isDuelModeEnabled() &&
      (DuelState.isInDuelFlow() || DuelState.getFlowState() === "RESULTS")
    ) {
      console.log("[TribePage] Keeping socket connected during duel flow");
      return;
    }

    TribeChat.reset("lobby");

    if (!TribeState.isInARoom()) {
      tribeSocket.disconnect();
      TribePagePreloader.reset();
    }
  },
  beforeShow: async () => {
    // Skip chat restore in duel mode (chat is hidden)
    if (isDuelModeEnabled()) return;

    if (TribeState.isInARoom()) {
      void TribeChat.fill("lobby").then(() => {
        TribeChat.scrollChat();
      });
    }
  },
  afterShow: async () => {
    // In duel mode with LOBBY state, show the duel lobby page
    if (isDuelModeEnabled() && DuelState.getFlowState() === "LOBBY") {
      console.log("[TribePage] Showing duel lobby page");
      void TribePages.change("lobby");
      return;
    }

    // In duel mode with RESULTS state, show duel complete messaging
    if (isDuelModeEnabled() && DuelState.getFlowState() === "RESULTS") {
      console.log("[TribePage] Showing duel results page");
      void TribePages.change("lobby");
      return;
    }

    if (TribeState.getState() === CLIENT_STATE.DISCONNECTED) {
      console.debug("Hello from route-controller /tribe afterShow");
      console.debug("TribeState is disconnected, initializing Tribe");
      void Tribe.init();
    }
  },
});

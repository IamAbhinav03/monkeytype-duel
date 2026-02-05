// System L/R selection page
// Allows user to select which side (L or R) they want to control

import type { DuelSide } from "../duel/duel-state";

// Callback for when a side is selected
let onSideSelectCallback: ((side: DuelSide) => void) | null = null;

/**
 * Initialize the system page event handlers.
 * @param onSideSelect - Callback when a side is selected
 */
export function init(onSideSelect: (side: DuelSide) => void): void {
  onSideSelectCallback = onSideSelect;

  // Set up click handlers for side buttons
  $(".pageTribe .tribePage.system .sideButton")
    .off("click")
    .on("click", function () {
      const side = $(this).attr("data-side") as DuelSide | undefined;
      if (side === "L" || side === "R") {
        if (onSideSelectCallback) {
          onSideSelectCallback(side);
        }
      }
    });
}

/**
 * Reset the page state.
 */
export function reset(): void {
  // Remove any selected state from buttons
  $(".pageTribe .tribePage.system .sideButton").removeClass("selected");
}

/**
 * Disable side buttons (e.g., during loading).
 */
export function disable(): void {
  $(".pageTribe .tribePage.system .sideButton").addClass("disabled");
}

/**
 * Enable side buttons.
 */
export function enable(): void {
  $(".pageTribe .tribePage.system .sideButton").removeClass("disabled");
}

/**
 * Mark a side as unavailable (already taken).
 */
export function markUnavailable(side: DuelSide): void {
  $(`.pageTribe .tribePage.system .sideButton[data-side="${side}"]`)
    .addClass("unavailable")
    .find(".subtext")
    .text("Occupied");
}

/**
 * Mark a side as available.
 */
export function markAvailable(side: DuelSide): void {
  const text = side === "L" ? "Left Side" : "Right Side";
  $(`.pageTribe .tribePage.system .sideButton[data-side="${side}"]`)
    .removeClass("unavailable")
    .find(".subtext")
    .text(text);
}

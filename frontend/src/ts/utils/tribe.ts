import { envConfig } from "virtual:env-config";
import { configurationPromise, get } from "../ape/server-configuration";

export function getTribeMode(): "disabled" | "enabled" | "enabled_stealth" {
  if (envConfig.forceTribe) return "enabled";
  return get()?.tribe?.mode ?? "disabled";
}

/**
 * Check if duel mode is enabled.
 * Duel mode replaces the standard tribe menu with the duel flow:
 * System L/R selection -> OTP auth -> Practice -> Lobby -> Race -> Results
 */
export function isDuelModeEnabled(): boolean {
  // Check environment config
  if (envConfig.forceDuel) return true;

  // Check URL parameter for testing
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("duel") === "true") return true;

  // Check localStorage for persistent setting
  if (window.localStorage.getItem("duel-mode") === "true") return true;

  return false;
}

export async function getAwaitedTribeMode(): Promise<
  "disabled" | "enabled" | "enabled_stealth"
> {
  if (envConfig.forceTribe) return "enabled";
  try {
    await configurationPromise;
    return getTribeMode();
  } catch {
    return "disabled";
  }
}

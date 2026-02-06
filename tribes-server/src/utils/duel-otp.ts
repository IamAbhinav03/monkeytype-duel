// OTP loader and validator for duel authentication
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { DUEL_CONFIG } from "../config.js";
import Logger from "./logger.js";

// Schema: JSON object mapping OTP IDs to usernames
const OtpMapSchema = z.record(z.string().min(1), z.string().min(1));

let otpMap: Record<string, string> = {};
let loaded = false;

/**
 * Load the OTP mapping from the configured JSON file.
 * Fails fast with process.exit(1) on invalid schema.
 * Only loads if DUEL_ENABLED is true.
 */
export function loadOtpMap(): void {
  if (!DUEL_CONFIG.ENABLED) {
    Logger.info("Duel mode disabled, skipping OTP load");
    return;
  }

  const path = DUEL_CONFIG.OTP_PATH;

  if (!existsSync(path)) {
    Logger.error(`OTP file not found at ${path}`);
    process.exit(1);
  }

  try {
    const raw = readFileSync(path, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    const result = OtpMapSchema.safeParse(parsed);

    if (!result.success) {
      Logger.error(`Invalid OTP schema: ${result.error.message}`);
      process.exit(1);
    }

    otpMap = result.data;
    loaded = true;
    Logger.success(
      `Loaded ${Object.keys(otpMap).length} OTP entries from ${path}`,
    );
  } catch (error) {
    Logger.error(`Failed to load OTP map: ${error}`);
    process.exit(1);
  }
}

/**
 * Validate an OTP and return the associated username if valid.
 */
export function validateOtp(otp: string): {
  valid: boolean;
  username?: string;
} {
  if (!loaded) {
    return { valid: false };
  }

  const username = otpMap[otp];
  if (username !== undefined) {
    return { valid: true, username };
  }

  return { valid: false };
}

/**
 * Get the current OTP map (readonly).
 */
export function getOtpMap(): Readonly<Record<string, string>> {
  return otpMap;
}

/**
 * Check if OTP map has been loaded.
 */
export function isLoaded(): boolean {
  return loaded;
}

/**
 * Add or update an OTP entry and persist to disk.
 */
export function setOtp(otp: string, username: string): void {
  otpMap[otp] = username;
  loaded = true;
  persistOtpMap();
  Logger.info(`OTP set: ${otp} -> ${username}`);
}

/**
 * Remove an OTP entry and persist to disk.
 */
export function removeOtp(otp: string): boolean {
  if (otpMap[otp] === undefined) return false;
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete otpMap[otp];
  persistOtpMap();
  Logger.info(`OTP removed: ${otp}`);
  return true;
}

/**
 * Replace the entire OTP map and persist to disk.
 */
export function setOtpMap(newMap: Record<string, string>): void {
  otpMap = { ...newMap };
  loaded = true;
  persistOtpMap();
  Logger.info(`OTP map replaced with ${Object.keys(otpMap).length} entries`);
}

function persistOtpMap(): void {
  try {
    writeFileSync(DUEL_CONFIG.OTP_PATH, JSON.stringify(otpMap, null, 2));
  } catch (error) {
    Logger.error(`Failed to persist OTP map: ${error}`);
  }
}

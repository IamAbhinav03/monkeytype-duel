import { z } from "zod";
import Logger from "./utils/logger.js";

// ============================================================================
// Environment Configuration Schema
// ============================================================================

const EnvironmentSchema = z.object({
  // Server
  PORT: z.string().regex(/^\d+$/).transform(Number).default("3005"),
  MODE: z.enum(["dev", "development", "production"]).default("production"),

  // Feature flags
  TRIBES_ENABLED: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("true"),

  // Firebase Auth (optional, but required for auth-protected features)
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().email().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),

  // Optional
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Environment = z.infer<typeof EnvironmentSchema>;

// ============================================================================
// Configuration Object
// ============================================================================

export type Config = {
  port: number;
  mode: "dev" | "development" | "production";
  isDev: boolean;
  tribesEnabled: boolean;
  firebaseEnabled: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
  firebase: {
    enabled: boolean;
    projectId?: string;
    clientEmail?: string;
    privateKey?: string;
  };
};

let config: Config | undefined;

// ============================================================================
// Configuration Loader
// ============================================================================

export function loadConfig(): Config {
  if (config) return config;

  const result = EnvironmentSchema.safeParse(process.env);

  if (!result.success) {
    Logger.error("Invalid environment configuration:");
    for (const error of result.error.errors) {
      Logger.error(`  ${error.path.join(".")}: ${error.message}`);
    }
    throw new Error("Invalid environment configuration");
  }

  const env = result.data;

  const firebaseEnabled = Boolean(
    env.FIREBASE_PROJECT_ID &&
    env.FIREBASE_CLIENT_EMAIL &&
    env.FIREBASE_PRIVATE_KEY,
  );

  config = {
    port: env.PORT,
    mode: env.MODE,
    isDev: env.MODE === "dev" || env.MODE === "development",
    tribesEnabled: env.TRIBES_ENABLED,
    firebaseEnabled,
    logLevel: env.LOG_LEVEL,
    firebase: {
      enabled: firebaseEnabled,
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
  };

  return config;
}

export function getConfig(): Config {
  if (!config) {
    return loadConfig();
  }
  return config;
}

// ============================================================================
// Validation Helpers
// ============================================================================

export type ValidationResult =
  | { success: true }
  | { success: false; errors: string[] };

export function validateConfig(): ValidationResult {
  const cfg = getConfig();
  const errors: string[] = [];

  if (!cfg.tribesEnabled) {
    Logger.warning("Tribes server is disabled via TRIBES_ENABLED=false");
  }

  if (!cfg.firebase.enabled) {
    Logger.warning(
      "Firebase authentication is not configured. Auth-protected features will be disabled.",
    );
    Logger.warning(
      "Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY to enable.",
    );
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true };
}

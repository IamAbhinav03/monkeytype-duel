import "dotenv/config";
import { loadConfig, validateConfig, getConfig } from "./config.js";
import { version } from "./version.js";
import Logger from "./utils/logger.js";

// Load and validate configuration first
loadConfig();
const configValidation = validateConfig();

if (!configValidation.success) {
  Logger.error("Configuration validation failed:");
  configValidation.errors.forEach((err) => {
    Logger.error(`  - ${err}`);
  });
  process.exit(1);
}

const config = getConfig();

async function startServer(): Promise<void> {
  // Dynamic import after config is loaded
  const { httpServer } = await import("./app.js");

  httpServer.listen(config.port, () => {
    Logger.info(`Tribes server v${version}`);
    Logger.info(`Mode: ${config.mode}`);
    Logger.info(`Firebase: ${config.firebaseEnabled ? "enabled" : "disabled"}`);
    Logger.success(`Tribes server listening on port ${config.port}`);
  });
}

startServer().catch((err) => {
  Logger.error(`Failed to start server: ${String(err)}`);
  process.exit(1);
});

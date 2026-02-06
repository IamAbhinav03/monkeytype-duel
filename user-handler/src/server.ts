import { createApp } from "./app.js";
import config from "./config.js";
import logger from "./utils/logger.js";

const app = createApp();

app.listen(config.port, () => {
  logger.info(`User Handler service started`);
  logger.info(`Version: ${config.version}`);
  logger.info(`Mode: ${config.mode}`);
  logger.info(`Port: ${config.port}`);
  logger.info(`Server running at http://localhost:${config.port}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM signal received: closing HTTP server");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT signal received: closing HTTP server");
  process.exit(0);
});

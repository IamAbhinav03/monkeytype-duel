import "dotenv/config";
import { httpServer } from "./app.js";
import { version } from "./version.js";
import Logger from "./utils/logger.js";

const PORT = parseInt(process.env["PORT"] ?? "3005", 10);
const MODE = process.env["MODE"] ?? "production";

function startServer(): void {
  httpServer.listen(PORT, () => {
    Logger.info(`Tribes server v${version}`);
    Logger.info(`Mode: ${MODE}`);
    Logger.success(`Tribes server listening on port ${PORT}`);
  });
}

startServer();

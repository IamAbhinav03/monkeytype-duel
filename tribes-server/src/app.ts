import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { registerSystemHandlers } from "./controllers/system-controller.js";
import { registerRoomHandlers } from "./controllers/room-controller.js";
import { registerUserHandlers } from "./controllers/user-controller.js";
import { registerDevHandlers } from "./controllers/dev-controller.js";
import { startMatchmaking } from "./services/matchmaking-service.js";
import { roomStore } from "./stores/room-store.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "@monkeytype/contracts/tribes-socket";
import {
  authenticateSocket,
  initializeSocketData,
  startRateLimitCleanup,
  stopRateLimitCleanup,
} from "./middleware/index.js";
import { initializeFirebase } from "./auth/index.js";
import { getConfig } from "./config.js";
import Logger from "./utils/logger.js";

const app = express();
const httpServer = createServer(app);

const config = getConfig();
const isDevMode = config.mode === "dev" || config.mode === "development";

// In dev mode, allow all origins (localhost, LAN IPs, etc.)
const corsOptions = isDevMode
  ? {
      origin: true, // Allow all origins in dev mode
      methods: ["GET", "POST"],
      credentials: true,
    }
  : {
      origin: ["https://monkeytype.com", "https://dev.monkeytype.com"],
      methods: ["GET", "POST"],
      credentials: true,
    };

app.use(cors(corsOptions));

app.use(express.json());

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Stats endpoint
app.get("/stats", (_req, res) => {
  const roomCount = roomStore.getRoomCount();
  res.json({
    rooms: roomCount,
    connected: roomStore.getConnectedCount(),
  });
});

// Create Socket.IO server
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Initialize services
initializeFirebase();
startRateLimitCleanup();

// Periodically clean up inactive rooms
const ROOM_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const roomCleanupInterval = setInterval(() => {
  const cleaned = roomStore.cleanupInactiveRooms();
  if (cleaned > 0) {
    Logger.info(`Cleaned up ${cleaned} inactive room(s)`);
  }
}, ROOM_CLEANUP_INTERVAL);

// Handle new socket connections
io.on("connection", async (socket) => {
  // Initialize socket data
  initializeSocketData(socket);

  // Attempt authentication (non-blocking)
  await authenticateSocket(socket);

  Logger.info(
    `Socket connected: ${socket.id} (${socket.data.name})${socket.data.uid ? ` [uid: ${socket.data.uid}]` : ""}`,
  );

  // Register all handlers
  registerSystemHandlers(io, socket);
  registerRoomHandlers(io, socket);
  registerUserHandlers(io, socket);
  registerDevHandlers(io, socket);
});

// Start matchmaking service
startMatchmaking(io);

// Graceful shutdown
function shutdown(): void {
  Logger.info("Shutting down...");
  clearInterval(roomCleanupInterval);
  stopRateLimitCleanup();
  httpServer.close();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { app, httpServer, io };

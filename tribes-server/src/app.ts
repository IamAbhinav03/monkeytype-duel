import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { registerSystemHandlers } from "./controllers/system-controller.js";
import { registerRoomHandlers } from "./controllers/room-controller.js";
import { registerUserHandlers } from "./controllers/user-controller.js";
import { registerDevHandlers } from "./controllers/dev-controller.js";
import { startMatchmaking } from "./services/matchmaking-service.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "./types/events.js";
import Logger from "./utils/logger.js";

const app = express();
const httpServer = createServer(app);

const mode = process.env["MODE"] ?? "dev";
const isDevMode = mode === "dev" || mode === "development";

// In dev mode, allow all origins (localhost, LAN IPs, etc.)
const corsOptions = isDevMode
  ? {
      origin: true, // Allow all origins in dev mode
      methods: ["GET", "POST"],
      credentials: true,
    }
  : {
      origin: [
        "https://monkeytype.com",
        "https://dev.monkeytype.com",
        "https://monkeytype-test.rbh.makerspace.tools",
        "https://monkeytype.rbh.makerspace.tools",
      ],
      methods: ["GET", "POST"],
      credentials: true,
    };

app.use(cors(corsOptions));

app.use(express.json());

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
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

// Handle new socket connections
io.on("connection", (socket) => {
  // Get name from handshake query
  const queryName = socket.handshake.query["name"];
  socket.data.name = typeof queryName === "string" ? queryName : "Guest";

  Logger.info(`Socket connected: ${socket.id} (${socket.data.name})`);

  // Register all handlers
  registerSystemHandlers(io, socket);
  registerRoomHandlers(io, socket);
  registerUserHandlers(io, socket);
  registerDevHandlers(io, socket);
});

// Start matchmaking service
startMatchmaking(io);

export { app, httpServer, io };

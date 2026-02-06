import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { registerSystemHandlers } from "./controllers/system-controller.js";
import { registerRoomHandlers } from "./controllers/room-controller.js";
import { registerUserHandlers } from "./controllers/user-controller.js";
import { registerDevHandlers } from "./controllers/dev-controller.js";
import { registerDuelHandlers } from "./controllers/duel-controller.js";
import { startMatchmaking } from "./services/matchmaking-service.js";
import { loadOtpMap, getOtpMap } from "./utils/duel-otp.js";
import { duelStore } from "./stores/duel-store.js";
import { roomStore } from "./stores/room-store.js";
import { DUEL_CONFIG } from "./config.js";
import * as duelService from "./services/duel-service.js";
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

// Duel HTTP endpoints
app.get("/duel/status", (_req, res): void => {
  if (!DUEL_CONFIG.ENABLED) {
    res.status(404).json({ error: "Duel mode disabled" });
    return;
  }
  res.json(duelService.getDuelStatus());
});

app.get("/duel/live-wpm", (_req, res): void => {
  if (!DUEL_CONFIG.ENABLED) {
    res.status(404).json({ error: "Duel mode disabled" });
    return;
  }
  res.json(duelStore.getLiveWpm());
});

app.get("/duel/results", (_req, res): void => {
  if (!DUEL_CONFIG.ENABLED) {
    res.status(404).json({ error: "Duel mode disabled" });
    return;
  }
  res.json(duelStore.getResults());
});

app.get("/duel/leaderboard", (_req, res): void => {
  if (!DUEL_CONFIG.ENABLED) {
    res.status(404).json({ error: "Duel mode disabled" });
    return;
  }
  res.json(duelStore.getLeaderboard());
});

app.get("/duel/spectator", (_req, res): void => {
  if (!DUEL_CONFIG.ENABLED) {
    res.status(404).json({ error: "Duel mode disabled" });
    return;
  }

  const participants = duelStore.getParticipants();
  const liveWpm = duelStore.getLiveWpm();
  const activeRoomId = duelStore.getActiveRoom();
  const room = activeRoomId ? roomStore.getRoom(activeRoomId) : undefined;

  const raceStartAt =
    room?.type === "duel" && room.startAt !== undefined ? room.startAt : null;

  const leftName =
    participants.L?.username && participants.L.username.trim().length > 0
      ? participants.L.username
      : "System Left";
  const rightName =
    participants.R?.username && participants.R.username.trim().length > 0
      ? participants.R.username
      : "System Right";

  res.json({
    serverTime: Date.now(),
    roomId: room?.id ?? null,
    roomState: room?.state ?? null,
    active:
      room?.type === "duel" &&
      (room.state === "RACE_ONGOING" || room.state === "RACE_ONE_FINISHED"),
    race: {
      startAt: raceStartAt,
      duration: DUEL_CONFIG.RACE_DURATION_SECONDS,
    },
    sides: {
      L: participants.L
        ? {
            id: participants.L.userId,
            name: leftName,
            wpm: liveWpm.L?.wpm ?? 0,
            connected:
              io.sockets.sockets.get(participants.L.socketId)?.connected ??
              false,
          }
        : null,
      R: participants.R
        ? {
            id: participants.R.userId,
            name: rightName,
            wpm: liveWpm.R?.wpm ?? 0,
            connected:
              io.sockets.sockets.get(participants.R.socketId)?.connected ??
              false,
          }
        : null,
    },
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

// Load OTP map and persisted results for duel mode at startup
loadOtpMap();
duelStore.loadResults();
duelStore.seedLeaderboardFromOtpMap(getOtpMap());

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
  registerDuelHandlers(io, socket);
});

// Start matchmaking service
startMatchmaking(io);

export { app, httpServer, io };

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
import {
  loadOtpMap,
  getOtpMap,
  setOtp,
  removeOtp,
  setOtpMap,
} from "./utils/duel-otp.js";
import { duelStore } from "./stores/duel-store.js";
import { DUEL_CONFIG } from "./config.js";
import * as duelService from "./services/duel-service.js";
import {
  buildDuelSpectatorState,
  emitDuelLeaderboardSnapshot,
  emitDuelSpectatorState,
} from "./services/duel-spectator-service.js";
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
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
    }
  : {
      origin: [
        "https://monkeytype.com",
        "https://dev.monkeytype.com",
        "https://monkeytype-test.rbh.makerspace.tools",
        "https://monkeytype.rbh.makerspace.tools",
      ],
      methods: ["GET", "POST", "PUT", "DELETE"],
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
  res.json(buildDuelSpectatorState(io));
});

// --- Admin endpoints ---

// GET /duel/admin/users — list all OTP users
app.get("/duel/admin/users", (_req, res): void => {
  if (!DUEL_CONFIG.ENABLED) {
    res.status(404).json({ error: "Duel mode disabled" });
    return;
  }
  res.json(getOtpMap());
});

// POST /duel/admin/users — add/update users
// Body: { "123456": "alice", "654321": "bob" }
// Merges into existing map. To replace entirely, use PUT.
app.post("/duel/admin/users", (req, res): void => {
  if (!DUEL_CONFIG.ENABLED) {
    res.status(404).json({ error: "Duel mode disabled" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "Body must be an object of otp: username" });
    return;
  }

  let count = 0;
  for (const [otp, username] of Object.entries(body)) {
    if (typeof username !== "string" || username.length === 0) {
      res.status(400).json({ error: `Invalid username for OTP "${otp}"` });
      return;
    }
    setOtp(otp, username);
    count++;
  }

  // Seed leaderboard for new users
  duelStore.seedLeaderboardFromOtpMap(getOtpMap());

  res.json({ ok: true, added: count, total: Object.keys(getOtpMap()).length });
});

// PUT /duel/admin/users — replace entire OTP map
app.put("/duel/admin/users", (req, res): void => {
  if (!DUEL_CONFIG.ENABLED) {
    res.status(404).json({ error: "Duel mode disabled" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "Body must be an object of otp: username" });
    return;
  }

  const newMap: Record<string, string> = {};
  for (const [otp, username] of Object.entries(body)) {
    if (typeof username !== "string" || username.length === 0) {
      res.status(400).json({ error: `Invalid username for OTP "${otp}"` });
      return;
    }
    newMap[otp] = username;
  }

  setOtpMap(newMap);
  duelStore.seedLeaderboardFromOtpMap(getOtpMap());

  res.json({ ok: true, total: Object.keys(newMap).length });
});

// DELETE /duel/admin/users/:otp — remove a single user
app.delete("/duel/admin/users/:otp", (req, res): void => {
  if (!DUEL_CONFIG.ENABLED) {
    res.status(404).json({ error: "Duel mode disabled" });
    return;
  }

  const removed = removeOtp(req.params["otp"] ?? "");
  if (!removed) {
    res.status(404).json({ error: "OTP not found" });
    return;
  }
  res.json({ ok: true, total: Object.keys(getOtpMap()).length });
});

// GET /duel/admin/config — view mutable config
app.get("/duel/admin/config", (_req, res): void => {
  if (!DUEL_CONFIG.ENABLED) {
    res.status(404).json({ error: "Duel mode disabled" });
    return;
  }
  res.json({
    PRACTICE_COUNT: DUEL_CONFIG.PRACTICE_COUNT,
    RACE_DURATION_SECONDS: DUEL_CONFIG.RACE_DURATION_SECONDS,
    START_DELAY_MS: DUEL_CONFIG.START_DELAY_MS,
  });
});

// POST /duel/admin/config — update mutable config fields
// Body: { "RACE_DURATION_SECONDS": 60, "PRACTICE_COUNT": 1 }
app.post("/duel/admin/config", (req, res): void => {
  if (!DUEL_CONFIG.ENABLED) {
    res.status(404).json({ error: "Duel mode disabled" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const updated: string[] = [];

  if (typeof body["PRACTICE_COUNT"] === "number") {
    (DUEL_CONFIG as { PRACTICE_COUNT: number }).PRACTICE_COUNT =
      body["PRACTICE_COUNT"];
    updated.push("PRACTICE_COUNT");
  }
  if (typeof body["RACE_DURATION_SECONDS"] === "number") {
    (DUEL_CONFIG as { RACE_DURATION_SECONDS: number }).RACE_DURATION_SECONDS =
      body["RACE_DURATION_SECONDS"];
    updated.push("RACE_DURATION_SECONDS");
  }
  if (typeof body["START_DELAY_MS"] === "number") {
    (DUEL_CONFIG as { START_DELAY_MS: number }).START_DELAY_MS =
      body["START_DELAY_MS"];
    updated.push("START_DELAY_MS");
  }

  if (updated.length === 0) {
    res.status(400).json({
      error:
        "No valid fields. Use: PRACTICE_COUNT, RACE_DURATION_SECONDS, START_DELAY_MS",
    });
    return;
  }

  Logger.info(`Config updated: ${updated.join(", ")}`);
  res.json({
    ok: true,
    updated,
    config: {
      PRACTICE_COUNT: DUEL_CONFIG.PRACTICE_COUNT,
      RACE_DURATION_SECONDS: DUEL_CONFIG.RACE_DURATION_SECONDS,
      START_DELAY_MS: DUEL_CONFIG.START_DELAY_MS,
    },
  });
});

// POST /duel/admin/leaderboard — set leaderboard entries
// Body: { "123456": { "name": "alice", "wpm": 120, "acc": 98, "raw": 125, "consistency": 85 } }
app.post("/duel/admin/leaderboard", (req, res): void => {
  if (!DUEL_CONFIG.ENABLED) {
    res.status(404).json({ error: "Duel mode disabled" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "Body must be an object of userId: entry" });
    return;
  }

  let count = 0;
  for (const [userId, raw] of Object.entries(body)) {
    if (!raw || typeof raw !== "object") {
      res.status(400).json({ error: `Invalid entry for "${userId}"` });
      return;
    }
    const entry = raw as Record<string, unknown>;
    if (typeof entry["name"] !== "string") {
      res.status(400).json({ error: `Missing name for "${userId}"` });
      return;
    }
    duelStore.setLeaderboardEntry(userId, {
      name: entry["name"],
      wpm: typeof entry["wpm"] === "number" ? entry["wpm"] : -1,
      acc: typeof entry["acc"] === "number" ? entry["acc"] : -1,
      raw: typeof entry["raw"] === "number" ? entry["raw"] : -1,
      consistency:
        typeof entry["consistency"] === "number" ? entry["consistency"] : -1,
      date: typeof entry["date"] === "number" ? entry["date"] : Date.now(),
    });
    count++;
  }

  res.json({ ok: true, updated: count });
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

// Socket push loops for spectator clients (replaces per-client HTTP polling).
if (DUEL_CONFIG.ENABLED) {
  const DUEL_STATE_PUSH_INTERVAL_MS = 250;
  const DUEL_LEADERBOARD_PUSH_INTERVAL_MS = 1000;

  setInterval(() => {
    emitDuelSpectatorState(io);
  }, DUEL_STATE_PUSH_INTERVAL_MS);

  setInterval(() => {
    emitDuelLeaderboardSnapshot(io);
  }, DUEL_LEADERBOARD_PUSH_INTERVAL_MS);
}

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

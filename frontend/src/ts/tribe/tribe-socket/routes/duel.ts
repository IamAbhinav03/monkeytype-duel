/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import Socket from "../socket";
import type { DuelSide } from "../../duel/duel-state";

// Response types
export type DuelAckResponse = {
  ok: boolean;
  error?: string;
  data?: unknown;
};

export type TimeSyncResponse = {
  clientTime: number;
  serverTime: number;
};

const DUEL_ACK_TIMEOUT_MS = 5000;
const ACK_TIMEOUT_ERROR = "Request timed out. Check connection and retry.";

async function emitWithAck<T>(
  event: string,
  fallbackResponse: T,
  data?: unknown,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const ackPromise = new Promise<T>((resolve) => {
    const ack = (response: T): void => {
      resolve(response);
    };

    if (data === undefined) {
      Socket.emit(event as never, ack as never);
    } else {
      Socket.emit(event as never, data as never, ack as never);
    }
  });

  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(
        `[DuelSocket] ${event} ACK timeout after ${DUEL_ACK_TIMEOUT_MS}ms`,
      );
      resolve(fallbackResponse);
    }, DUEL_ACK_TIMEOUT_MS);
  });

  const response = await Promise.race([ackPromise, timeoutPromise]);
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
  return response;
}

// --- OUT (Client -> Server) ---

async function registerSystem(side: DuelSide): Promise<DuelAckResponse> {
  return emitWithAck<DuelAckResponse>(
    "duel_register_system",
    { ok: false, error: ACK_TIMEOUT_ERROR },
    { side },
  );
}

async function authenticate(otp: string): Promise<DuelAckResponse> {
  return emitWithAck<DuelAckResponse>(
    "duel_authenticate",
    { ok: false, error: ACK_TIMEOUT_ERROR },
    { otp },
  );
}

async function practiceComplete(): Promise<DuelAckResponse> {
  return emitWithAck<DuelAckResponse>("duel_practice_complete", {
    ok: false,
    error: ACK_TIMEOUT_ERROR,
  });
}

async function joinLobby(): Promise<DuelAckResponse> {
  return emitWithAck<DuelAckResponse>("duel_join_lobby", {
    ok: false,
    error: ACK_TIMEOUT_ERROR,
  });
}

async function resetSession(): Promise<DuelAckResponse> {
  return emitWithAck<DuelAckResponse>("duel_reset_session", {
    ok: false,
    error: ACK_TIMEOUT_ERROR,
  });
}

async function timeSync(clientTime: number): Promise<TimeSyncResponse> {
  return emitWithAck<TimeSyncResponse>(
    "duel_time_sync",
    { clientTime, serverTime: Date.now() },
    { clientTime },
  );
}

// --- IN (Server -> Client) ---

function opponentJoined(
  callback: (data: { username: string; side: DuelSide }) => void,
): void {
  Socket.on("duel_opponent_joined", callback);
}

function opponentLeft(callback: (data: { side: DuelSide }) => void): void {
  Socket.on("duel_opponent_left", callback);
}

function raceScheduled(
  callback: (data: {
    startAt: number;
    seed: number;
    raceDuration: number;
  }) => void,
): void {
  Socket.on("duel_race_scheduled", callback);
}

export default {
  in: {
    opponentJoined,
    opponentLeft,
    raceScheduled,
  },
  out: {
    registerSystem,
    authenticate,
    practiceComplete,
    joinLobby,
    resetSession,
    timeSync,
  },
};

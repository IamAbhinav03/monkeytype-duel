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

// --- OUT (Client -> Server) ---

async function registerSystem(side: DuelSide): Promise<DuelAckResponse> {
  return new Promise((resolve) => {
    Socket.emit(
      "duel_register_system",
      { side },
      (response: DuelAckResponse) => {
        resolve(response);
      },
    );
  });
}

async function authenticate(otp: string): Promise<DuelAckResponse> {
  return new Promise((resolve) => {
    Socket.emit("duel_authenticate", { otp }, (response: DuelAckResponse) => {
      resolve(response);
    });
  });
}

async function practiceComplete(): Promise<DuelAckResponse> {
  return new Promise((resolve) => {
    Socket.emit("duel_practice_complete", (response: DuelAckResponse) => {
      resolve(response);
    });
  });
}

async function joinLobby(): Promise<DuelAckResponse> {
  return new Promise((resolve) => {
    Socket.emit("duel_join_lobby", (response: DuelAckResponse) => {
      resolve(response);
    });
  });
}

async function resetSession(): Promise<DuelAckResponse> {
  return new Promise((resolve) => {
    Socket.emit("duel_reset_session", (response: DuelAckResponse) => {
      resolve(response);
    });
  });
}

async function timeSync(clientTime: number): Promise<TimeSyncResponse> {
  return new Promise((resolve) => {
    Socket.emit(
      "duel_time_sync",
      { clientTime },
      (response: TimeSyncResponse) => {
        resolve(response);
      },
    );
  });
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

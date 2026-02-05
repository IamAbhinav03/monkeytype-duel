import type { RoomConfig } from "./config.js";

export const ROOM_STATE = {
  LOBBY: "LOBBY",
  RACE_INIT: "RACE_INIT",
  RACE_COUNTDOWN: "RACE_COUNTDOWN",
  RACE_ONGOING: "RACE_ONGOING",
  RACE_ONE_FINISHED: "RACE_ONE_FINISHED",
  RACE_AWAITING_RESULTS: "RACE_AWAITING_RESULTS",
  SHOWING_RESULTS: "SHOWING_RESULTS",
  READY_TO_CONTINUE: "READY_TO_CONTINUE",
} as const;

export type RoomState = (typeof ROOM_STATE)[keyof typeof ROOM_STATE];

export const CLIENT_STATE = {
  DISCONNECTED: "DISCONNECTED",
  CONNECTED: "CONNECTED",
  IN_ROOM: "IN_ROOM",
} as const;

export type ClientState = (typeof CLIENT_STATE)[keyof typeof CLIENT_STATE];

export type ChartData = {
  wpm: number[];
  raw: number[];
  err: number[];
};

export type Result = {
  wpm: number;
  raw: number;
  acc: number;
  consistency: number;
  testDuration: number;
  charStats: number[];
  chartData: ChartData;
  resolve: ResultResolve;
};

export type ResultResolve =
  | {
      login: true;
      bailedOut: boolean;
      valid?: false;
      invalidReason?: string;
      failed?: true;
      failedReason?: string;
      saved?: boolean;
      isPb?: boolean;
      saveFailedMessage?: string;
    }
  | {
      login: false;
      bailedOut: boolean;
      valid?: false;
      invalidReason?: string;
      failed?: true;
      failedReason?: string;
    };

export type UserProgress = {
  wpm: number;
  raw: number;
  acc: number;
  progress: number;
  wpmProgress: number;
  wordIndex: number;
  letterIndex: number;
  afk: boolean;
};

export type UserProgressOut = {
  wpm: number;
  raw: number;
  acc: number;
  progress: number;
  wordIndex: number;
  letterIndex: number;
  afk: boolean;
};

export type User = {
  id: string;
  isLeader?: boolean;
  name: string;
  isReady?: boolean;
  result?: Result;
  progress?: UserProgress;
  isFinished?: boolean;
  isTyping?: boolean;
  isAfk?: boolean;
  isChatting?: boolean;
  points?: number;
};

export type Room = {
  id: string;
  state: RoomState;
  users: Record<string, User>;
  size: number;
  updateRate: number;
  isPrivate: boolean;
  name: string;
  config: RoomConfig;
  maxRaw: number;
  maxWpm: number;
  minRaw: number;
  minWpm: number;
  seed: number;
  practiceRound: number;
};

export type PublicRoomData = {
  id: string;
  size: number;
  name: string;
  state: RoomState;
  config: RoomConfig;
};

export type MiniCrowns = {
  raw: string[];
  wpm: string[];
  acc: string[];
  consistency: string[];
};

export type FinalPosition = {
  id: string;
  newPoints: number;
  newPointsTotal: number;
};

export type FinalPositions = Record<number, FinalPosition[]>;

export type SystemStats = {
  pingStart: number;
  stats: [
    number,
    {
      mm: [number, number, number, number];
      custom: [number, number];
    },
    [number, number, number, number],
    string,
  ];
};

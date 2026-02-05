import { z } from "zod";
import { PercentageSchema, WpmSchema } from "./util";
import { ModeSchema, DifficultySchema } from "./shared";
import { LanguageSchema } from "./languages";

// ============================================================================
// Protocol Version
// ============================================================================

export const TRIBES_PROTOCOL_VERSION = "1.0.0";

// ============================================================================
// Room State
// ============================================================================

export const RoomStateSchema = z.enum([
  "LOBBY",
  "RACE_INIT",
  "RACE_COUNTDOWN",
  "RACE_ONGOING",
  "RACE_ONE_FINISHED",
  "RACE_AWAITING_RESULTS",
  "SHOWING_RESULTS",
  "READY_TO_CONTINUE",
]);
export type RoomState = z.infer<typeof RoomStateSchema>;

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

// ============================================================================
// Client State
// ============================================================================

export const ClientStateSchema = z.enum([
  "DISCONNECTED",
  "CONNECTED",
  "IN_ROOM",
]);
export type ClientState = z.infer<typeof ClientStateSchema>;

export const CLIENT_STATE = {
  DISCONNECTED: "DISCONNECTED",
  CONNECTED: "CONNECTED",
  IN_ROOM: "IN_ROOM",
} as const;

// ============================================================================
// Room ID
// ============================================================================

export const RoomIdSchema = z
  .string()
  .regex(/^[A-F0-9]{6}$/, "Room ID must be 6 uppercase hex characters");
export type RoomId = z.infer<typeof RoomIdSchema>;

// ============================================================================
// Custom Text Settings (Tribe-specific)
// ============================================================================

export const TribeCustomTextSettingsSchema = z
  .object({
    text: z.array(z.string()),
    isWordRandom: z.boolean(),
    isTimeRandom: z.boolean(),
    word: z.number().int().nonnegative(),
    time: z.number().int().nonnegative(),
    delimiter: z.string().max(10),
    textLen: z.number().int().nonnegative().optional(),
  })
  .strict();
export type TribeCustomTextSettings = z.infer<
  typeof TribeCustomTextSettingsSchema
>;

// ============================================================================
// Room Config (subset of Config allowed in tribes)
// ============================================================================

export const StopOnErrorSchema = z.enum(["off", "word", "letter"]);
export type StopOnError = z.infer<typeof StopOnErrorSchema>;

export const MinWpmSchema = z.enum(["off", "custom"]);
export type MinWpm = z.infer<typeof MinWpmSchema>;

export const MinAccSchema = z.enum(["off", "custom"]);
export type MinAcc = z.infer<typeof MinAccSchema>;

export const MinBurstSchema = z.enum(["off", "fixed", "flex"]);
export type MinBurst = z.infer<typeof MinBurstSchema>;

export const QuoteLengthArraySchema = z
  .array(z.number().int().min(-3).max(3))
  .min(1)
  .max(6);
export type QuoteLengthArray = z.infer<typeof QuoteLengthArraySchema>;

export const RoomConfigSchema = z
  .object({
    mode: ModeSchema,
    time: z.number().int().nonnegative(),
    words: z.number().int().nonnegative(),
    language: LanguageSchema,
    difficulty: DifficultySchema,
    punctuation: z.boolean(),
    numbers: z.boolean(),
    funbox: z.string().max(100),
    lazyMode: z.boolean(),
    stopOnError: StopOnErrorSchema,
    minWpm: MinWpmSchema,
    minWpmCustomSpeed: z.number().nonnegative(),
    minAcc: MinAccSchema,
    minAccCustom: z.number().nonnegative().max(100),
    minBurst: MinBurstSchema,
    minBurstCustomSpeed: z.number().nonnegative(),
    quoteLength: QuoteLengthArraySchema,
    customText: TribeCustomTextSettingsSchema,
  })
  .strict();
export type RoomConfig = z.infer<typeof RoomConfigSchema>;

// ============================================================================
// Chart Data (Tribe-specific, with raw instead of burst for compatibility)
// ============================================================================

export const TribeChartDataSchema = z
  .object({
    wpm: z.array(z.number().nonnegative()).max(122),
    raw: z.array(z.number().int().nonnegative()).max(122),
    err: z.array(z.number().nonnegative()).max(122),
  })
  .strict();
export type TribeChartData = z.infer<typeof TribeChartDataSchema>;

// ============================================================================
// Result Resolve
// ============================================================================

const ResultResolveBaseSchema = z.object({
  bailedOut: z.boolean(),
  valid: z.literal(false).optional(),
  invalidReason: z.string().optional(),
  failed: z.literal(true).optional(),
  failedReason: z.string().optional(),
});

export const ResultResolveLoggedInSchema = ResultResolveBaseSchema.extend({
  login: z.literal(true),
  saved: z.boolean().optional(),
  isPb: z.boolean().optional(),
  saveFailedMessage: z.string().optional(),
});

export const ResultResolveLoggedOutSchema = ResultResolveBaseSchema.extend({
  login: z.literal(false),
});

export const ResultResolveSchema = z.union([
  ResultResolveLoggedInSchema,
  ResultResolveLoggedOutSchema,
]);
export type ResultResolve = z.infer<typeof ResultResolveSchema>;

// ============================================================================
// Tribe Result
// ============================================================================

export const TribeResultSchema = z
  .object({
    wpm: WpmSchema,
    raw: WpmSchema,
    acc: PercentageSchema,
    consistency: PercentageSchema,
    testDuration: z.number().positive(),
    charStats: z.array(z.number().int().nonnegative()).length(4),
    chartData: TribeChartDataSchema,
    resolve: ResultResolveSchema,
  })
  .strict();
export type TribeResult = z.infer<typeof TribeResultSchema>;

// ============================================================================
// User Progress
// ============================================================================

export const UserProgressSchema = z
  .object({
    wpm: z.number().nonnegative(),
    raw: z.number().nonnegative(),
    acc: PercentageSchema,
    progress: PercentageSchema,
    wpmProgress: PercentageSchema,
    wordIndex: z.number().int().nonnegative(),
    letterIndex: z.number().int().nonnegative(),
    afk: z.boolean(),
  })
  .strict();
export type UserProgress = z.infer<typeof UserProgressSchema>;

// Client sends this (without wpmProgress)
export const UserProgressOutSchema = z
  .object({
    wpm: z.number().nonnegative(),
    raw: z.number().nonnegative(),
    acc: PercentageSchema,
    progress: PercentageSchema,
    wordIndex: z.number().int().nonnegative(),
    letterIndex: z.number().int().nonnegative(),
    afk: z.boolean(),
  })
  .strict();
export type UserProgressOut = z.infer<typeof UserProgressOutSchema>;

// ============================================================================
// User
// ============================================================================

export const TribeUserSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(16),
    isLeader: z.boolean().optional(),
    isReady: z.boolean().optional(),
    result: TribeResultSchema.optional(),
    progress: UserProgressSchema.optional(),
    isFinished: z.boolean().optional(),
    isTyping: z.boolean().optional(),
    isAfk: z.boolean().optional(),
    isChatting: z.boolean().optional(),
    points: z.number().int().nonnegative().optional(),
  })
  .strict();
export type TribeUser = z.infer<typeof TribeUserSchema>;

// ============================================================================
// Room
// ============================================================================

export const RoomSchema = z
  .object({
    id: RoomIdSchema,
    state: RoomStateSchema,
    users: z.record(z.string(), TribeUserSchema),
    size: z.number().int().positive().max(8),
    updateRate: z.number().int().positive(),
    isPrivate: z.boolean(),
    name: z.string().min(1).max(50),
    config: RoomConfigSchema,
    maxRaw: z.number().nonnegative(),
    maxWpm: z.number().nonnegative(),
    minRaw: z.number().nonnegative(),
    minWpm: z.number().nonnegative(),
    seed: z.number().int(),
  })
  .strict();
export type Room = z.infer<typeof RoomSchema>;

// ============================================================================
// Public Room Data (for browsing)
// ============================================================================

export const PublicRoomDataSchema = z
  .object({
    id: RoomIdSchema,
    size: z.number().int().positive().max(8),
    name: z.string().min(1).max(50),
    state: RoomStateSchema,
    config: RoomConfigSchema,
  })
  .strict();
export type PublicRoomData = z.infer<typeof PublicRoomDataSchema>;

// ============================================================================
// Mini Crowns (winners of each stat)
// ============================================================================

export const MiniCrownsSchema = z
  .object({
    raw: z.array(z.string()),
    wpm: z.array(z.string()),
    acc: z.array(z.string()),
    consistency: z.array(z.string()),
  })
  .strict();
export type MiniCrowns = z.infer<typeof MiniCrownsSchema>;

// ============================================================================
// Final Position
// ============================================================================

export const FinalPositionSchema = z
  .object({
    id: z.string(),
    newPoints: z.number().int().nonnegative(),
    newPointsTotal: z.number().int().nonnegative(),
  })
  .strict();
export type FinalPosition = z.infer<typeof FinalPositionSchema>;

export const FinalPositionsSchema = z.record(
  z.string(),
  z.array(FinalPositionSchema),
);
export type FinalPositions = z.infer<typeof FinalPositionsSchema>;

// ============================================================================
// System Stats
// ============================================================================

export const QueueLengthsSchema = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
]);
export type QueueLengths = z.infer<typeof QueueLengthsSchema>;

export const RoomCountsSchema = z
  .object({
    mm: QueueLengthsSchema,
    custom: z.tuple([
      z.number().int().nonnegative(),
      z.number().int().nonnegative(),
    ]),
  })
  .strict();
export type RoomCounts = z.infer<typeof RoomCountsSchema>;

export const SystemStatsSchema = z
  .object({
    pingStart: z.number().int().positive(),
    stats: z.tuple([
      z.number().int().nonnegative(), // online users
      RoomCountsSchema, // rooms
      QueueLengthsSchema, // queueLengths
      z.string(), // version
    ]),
  })
  .strict();
export type SystemStats = z.infer<typeof SystemStatsSchema>;

// ============================================================================
// Matchmaking Queue
// ============================================================================

export const MatchmakingQueueSchema = z.enum([
  "TIME_15",
  "TIME_60",
  "MEDIUM_QUOTES",
  "LONG_QUOTES",
]);
export type MatchmakingQueue = z.infer<typeof MatchmakingQueueSchema>;

export const MATCHMAKING_QUEUE = {
  TIME_15: 0,
  TIME_60: 1,
  MEDIUM_QUOTES: 2,
  LONG_QUOTES: 3,
} as const;

// ============================================================================
// Socket Ack Response
// ============================================================================

export const SocketAckSuccessSchema = z
  .object({
    ok: z.literal(true),
    data: z.unknown().optional(),
  })
  .strict();
export type SocketAckSuccess = z.infer<typeof SocketAckSuccessSchema>;

export const SocketAckErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z.string(),
    status: z.number().int().min(400).max(599),
  })
  .strict();
export type SocketAckError = z.infer<typeof SocketAckErrorSchema>;

export const SocketAckSchema = z.union([
  SocketAckSuccessSchema,
  SocketAckErrorSchema,
]);
export type SocketAck = z.infer<typeof SocketAckSchema>;

// ============================================================================
// Socket Data (stored on socket instance)
// ============================================================================

export const SocketDataSchema = z
  .object({
    uid: z.string().optional(),
    name: z.string().max(16),
    roomId: z.string().optional(),
  })
  .strict();
export type SocketData = z.infer<typeof SocketDataSchema>;

// ============================================================================
// User Name Validation
// ============================================================================

export const TribeUserNameSchema = z
  .string()
  .min(1)
  .max(16)
  .regex(/^[^<>]+$/, "Name cannot contain < or >");
export type TribeUserName = z.infer<typeof TribeUserNameSchema>;

// ============================================================================
// Chat Message Validation
// ============================================================================

export const ChatMessageSchema = z.string().min(1).max(200);
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ============================================================================
// Room Name Validation
// ============================================================================

export const RoomNameSchema = z.string().min(1).max(50);
export type RoomName = z.infer<typeof RoomNameSchema>;

// ============================================================================
// Default Room Config
// ============================================================================

export function getDefaultRoomConfig(): RoomConfig {
  return {
    mode: "time",
    time: 15,
    words: 50,
    language: "english",
    difficulty: "normal",
    punctuation: false,
    numbers: false,
    funbox: "none",
    lazyMode: false,
    stopOnError: "off",
    minWpm: "off",
    minWpmCustomSpeed: 0,
    minAcc: "off",
    minAccCustom: 0,
    minBurst: "off",
    minBurstCustomSpeed: 0,
    quoteLength: [1, 2],
    customText: {
      text: [],
      isWordRandom: false,
      isTimeRandom: false,
      word: 0,
      time: 0,
      delimiter: " ",
    },
  };
}

// ============================================================================
// Matchmaking Config
// ============================================================================

export function getMatchmakingConfig(queueIndex: number): Partial<RoomConfig> {
  switch (queueIndex) {
    case 0:
      return { mode: "time", time: 15 };
    case 1:
      return { mode: "time", time: 60 };
    case 2:
      return { mode: "quote", quoteLength: [1, 2] };
    case 3:
      return { mode: "quote", quoteLength: [2, 3] };
    default:
      return { mode: "time", time: 15 };
  }
}

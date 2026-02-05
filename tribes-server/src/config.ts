// Duel-specific configuration
// All duel features are disabled by default - must be explicitly enabled
export const DUEL_CONFIG = {
  // Enable/disable duel mode entirely
  ENABLED: process.env["DUEL_ENABLED"] === "true",

  // Path to OTP mapping JSON file
  OTP_PATH: process.env["DUEL_OTP_PATH"] ?? "./duel-otp.json",

  // Path to persist duel results
  RESULTS_PATH: process.env["DUEL_RESULTS_PATH"] ?? "./duel-results.json",

  // Delay before synchronized race start (ms)
  // Must account for: 5s waiting page + 5s countdown = 10s minimum
  START_DELAY_MS: parseInt(process.env["DUEL_START_DELAY_MS"] ?? "10000", 10),

  // Number of practice runs required before joining lobby
  PRACTICE_COUNT: 2,

  // Race duration in seconds
  RACE_DURATION_SECONDS: 30,

  // Fixed room configuration for duel races
  ROOM_CONFIG: {
    mode: "time" as const,
    time: 30,
    words: 50,
    language: "english",
    difficulty: "normal" as const,
    punctuation: false,
    numbers: false,
    funbox: [] as string[],
    lazyMode: false,
    stopOnError: "off" as const,
    minWpm: "off" as const,
    minWpmCustomSpeed: 0,
    minAcc: "off" as const,
    minAccCustom: 0,
    minBurst: "off" as const,
    minBurstCustomSpeed: 0,
    quoteLength: [1, 2] as number[],
    customText: {
      text: [""] as string[],
      isWordRandom: false,
      isTimeRandom: false,
      word: 0,
      time: 0,
      delimiter: " ",
    },
  },
} as const;

export type DuelSide = "L" | "R";

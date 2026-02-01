export type CustomTextSettings = {
  text: string[];
  isWordRandom: boolean;
  isTimeRandom: boolean;
  word: number;
  time: number;
  delimiter: string;
  textLen?: number;
};

export type RoomConfig = {
  mode: "time" | "words" | "custom" | "quote" | "zen";
  time: number;
  words: number;
  language: string;
  difficulty: "normal" | "expert" | "master";
  punctuation: boolean;
  numbers: boolean;
  funbox: string;
  lazyMode: boolean;
  stopOnError: "off" | "word" | "letter";
  minWpm: "off" | "custom";
  minWpmCustomSpeed: number;
  minAcc: "off" | "custom";
  minAccCustom: number;
  minBurst: "off" | "fixed" | "flex";
  minBurstCustomSpeed: number;
  quoteLength: number[];
  customText: CustomTextSettings;
};

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

import type { Server } from "socket.io";
import { roomStore } from "../stores/room-store.js";
import { timerService, TimerType } from "./timer-service.js";
import {
  calculateFinalPositions,
  calculateMiniCrowns,
} from "./points-service.js";
import type {
  Room,
  RoomState,
  UserProgress,
  UserProgressOut,
  Result,
} from "../types/room.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../types/events.js";
import { generateSeed } from "../utils/id-generator.js";
import Logger from "../utils/logger.js";

type TribesServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

const COUNTDOWN_DURATION = 3000;
const COUNTDOWN_INTERVAL = 1000;
const FINISH_TIMER_DURATION = 15000;
const READY_TIMER_DURATION = 1000;
const PROGRESS_UPDATE_INTERVAL = 100;
const PRACTICE_LOBBY_DISPLAY_DURATION = 10; // Brief lobby display for practice rounds

const validTransitions: Record<RoomState, RoomState[]> = {
  LOBBY: ["RACE_INIT"],
  RACE_INIT: ["RACE_COUNTDOWN", "LOBBY"],
  RACE_COUNTDOWN: ["RACE_ONGOING", "LOBBY"],
  RACE_ONGOING: ["RACE_ONE_FINISHED", "RACE_AWAITING_RESULTS", "LOBBY"],
  RACE_ONE_FINISHED: ["RACE_AWAITING_RESULTS", "LOBBY", "RACE_INIT"],
  RACE_AWAITING_RESULTS: ["SHOWING_RESULTS", "LOBBY"],
  SHOWING_RESULTS: ["READY_TO_CONTINUE", "LOBBY", "RACE_INIT"], // Added RACE_INIT for practice round loop
  READY_TO_CONTINUE: ["LOBBY", "RACE_INIT"],
};

export function canTransition(from: RoomState, to: RoomState): boolean {
  return validTransitions[from]?.includes(to) ?? false;
}

export function transitionRoom(
  io: TribesServer,
  roomId: string,
  newState: RoomState,
): boolean {
  const room = roomStore.getRoom(roomId);
  if (!room) return false;
  if (room.state === "LOBBY" && newState !== "LOBBY") {
    timerService.clear(`${room.id}:${TimerType.LOBBY_AUTO_START}`);
  }

  if (!canTransition(room.state, newState)) {
    Logger.warning(`Invalid state transition: ${room.state} -> ${newState}`);
    return false;
  }

  room.state = newState;
  io.to(roomId).emit("room_state_changed", { state: newState });

  handleStateEntry(io, room, newState);
  return true;
}

function handleStateEntry(
  io: TribesServer,
  room: Room,
  state: RoomState,
): void {
  switch (state) {
    case "RACE_INIT":
      handleRaceInit(io, room);
      break;
    case "RACE_COUNTDOWN":
      handleRaceCountdown(io, room);
      break;
    case "RACE_ONGOING":
      handleRaceOngoing(io, room);
      break;
    case "RACE_ONE_FINISHED":
      handleRaceOneFinished(io, room);
      break;
    case "RACE_AWAITING_RESULTS":
      handleRaceAwaitingResults(io, room);
      break;
    case "SHOWING_RESULTS":
      handleShowingResults(io, room);
      break;
    case "READY_TO_CONTINUE":
      handleReadyToContinue(io, room);
      break;
    case "LOBBY":
      handleBackToLobby(io, room);
      break;
  }
}

function handleRaceInit(io: TribesServer, room: Room): void {
  room.seed = generateSeed();
  room.maxRaw = 0;
  room.maxWpm = 0;
  room.minRaw = Infinity;
  room.minWpm = Infinity;

  // Reset user states
  Object.values(room.users).forEach((user) => {
    user.isReady = false;
    user.isFinished = false;
    user.isTyping = false;
    user.result = undefined;
    user.progress = undefined;
  });

  // Initialize practice round on first race
  if (room.practiceRound === undefined || room.practiceRound === 0) {
    room.practiceRound = 1;
  }

  // Determine if this is a practice round or final
  const isPractice = room.practiceRound <= 2;
  const practiceRoundNumber = isPractice ? room.practiceRound : undefined;

  console.log(`Initializing race ${isPractice}`);
  io.to(room.id).emit("room_init_race", {
    seed: room.seed,
    practiceRound: practiceRoundNumber,
  });

  // Transition to countdown after a brief delay
  setTimeout(() => {
    if (room.state === "RACE_INIT") {
      transitionRoom(io, room.id, "RACE_COUNTDOWN");
    }
  }, 500);
}

function handleRaceCountdown(io: TribesServer, room: Room): void {
  let remaining = COUNTDOWN_DURATION / 1000;

  timerService.start(room.id, TimerType.COUNTDOWN, {
    duration: COUNTDOWN_DURATION,
    interval: COUNTDOWN_INTERVAL,
    onTick: (time) => {
      io.to(room.id).emit("room_countdown", {
        time: `${room.practiceRound <= 2 ? `P${room.practiceRound}` : "F"} | ${Math.ceil(time / 1000)}`,
      });
    },
    onComplete: () => {
      if (room.state === "RACE_COUNTDOWN") {
        transitionRoom(io, room.id, "RACE_ONGOING");
      }
    },
  });

  // Send initial countdown
  io.to(room.id).emit("room_countdown", {
    time: `${room.practiceRound <= 2 ? `P${room.practiceRound}` : "F"} | ${remaining}`,
  });
}

function handleRaceOngoing(io: TribesServer, room: Room): void {
  io.to(room.id).emit("room_race_started");

  // Start progress broadcast interval
  timerService.start(room.id, TimerType.PROGRESS, {
    duration: Infinity,
    interval: PROGRESS_UPDATE_INTERVAL,
    onTick: () => {
      broadcastProgress(io, room);
    },
    onComplete: (): void => {
      // Progress updates run until manually stopped
    },
  });
}

function handleRaceOneFinished(io: TribesServer, room: Room): void {
  // Start finish timer
  timerService.start(room.id, TimerType.FINISH, {
    duration: FINISH_TIMER_DURATION,
    interval: 1000,
    onTick: (time) => {
      io.to(room.id).emit("room_finishTimer_countdown", {
        time: Math.ceil(time / 1000),
      });
    },
    onComplete: () => {
      if (room.state === "RACE_ONE_FINISHED" || room.state === "RACE_ONGOING") {
        forceFinishRace(io, room, "Time limit reached");
      }
    },
  });
}

function handleRaceAwaitingResults(io: TribesServer, room: Room): void {
  // Stop progress updates
  timerService.clear(`${room.id}:${TimerType.PROGRESS}`);
  timerService.clear(`${room.id}:${TimerType.FINISH}`);

  // Calculate final positions after a short delay
  setTimeout(() => {
    if (room.state === "RACE_AWAITING_RESULTS") {
      transitionRoom(io, room.id, "SHOWING_RESULTS");
    }
  }, 1000);
}

function handleShowingResults(io: TribesServer, room: Room): void {
  const isPractice =
    room.practiceRound !== undefined && room.practiceRound <= 2;

  if (isPractice) {
    // For practice rounds: skip saving results, show brief lobby, then restart
    // Don't emit final_positions for practice rounds (no saving)

    // Increment practice round for next iteration
    room.practiceRound = (room.practiceRound ?? 1) + 1;

    // Emit brief lobby display event with practice round info
    io.to(room.id).emit("room_back_to_lobby", {
      practiceRound: room.practiceRound,
      briefDisplay: true,
    });

    console.log(`RESULTS ${isPractice}`);

    // Brief lobby display then auto-start next race
    setTimeout(() => {
      if (room.state === "SHOWING_RESULTS") {
        // Reset user ready states for next race
        Object.values(room.users).forEach((user) => {
          user.isReady = false;
          user.isFinished = false;
          user.isTyping = false;
          user.result = undefined;
          user.progress = undefined;
        });
        transitionRoom(io, room.id, "RACE_INIT");
      }
    }, PRACTICE_LOBBY_DISPLAY_DURATION);
  } else {
    // Final round (round 3): normal behavior with saving
    const positions = calculateFinalPositions(room);
    const miniCrowns = calculateMiniCrowns(room);

    io.to(room.id).emit("room_final_positions", { positions, miniCrowns });

    // Transition to ready after showing results
    setTimeout(() => {
      if (room.state === "SHOWING_RESULTS") {
        transitionRoom(io, room.id, "READY_TO_CONTINUE");
      }
    }, 3000);
  }
}

function handleReadyToContinue(io: TribesServer, room: Room): void {
  timerService.start(room.id, TimerType.READY, {
    duration: READY_TIMER_DURATION,
    interval: 1000,
    onTick: (time) => {
      io.to(room.id).emit("room_readyTimer_countdown", {
        time: Math.ceil(time / 1000),
      });
    },
    onComplete: () => {
      io.to(room.id).emit("room_readyTimer_over");
      if (room.state === "READY_TO_CONTINUE") {
        transitionRoom(io, room.id, "LOBBY");
      }
    },
  });
}

// function handleBackToLobby(io: TribesServer, room: Room): void {
//   timerService.clearAllForRoom(room.id);
//   roomStore.resetRoomForNextRace(room.id);
//   io.to(room.id).emit("room_back_to_lobby");
// }
//

function handleBackToLobby(io: TribesServer, room: Room): void {
  timerService.clearAllForRoom(room.id);
  roomStore.resetRoomForNextRace(room.id);

  // Reset practiceRound when going back to lobby (after final race or manual return)
  room.practiceRound = 0;

  io.to(room.id).emit("room_back_to_lobby", {
    practiceRound: undefined,
    briefDisplay: false,
  });
}

function broadcastProgress(io: TribesServer, room: Room): void {
  const users: Record<string, UserProgress> = {};

  let maxRaw = 0;
  let maxWpm = 0;
  let minRaw = Infinity;
  let minWpm = Infinity;

  Object.entries(room.users).forEach(([id, user]) => {
    if (user.progress) {
      users[id] = user.progress;

      if (user.progress.raw > maxRaw) maxRaw = user.progress.raw;
      if (user.progress.wpm > maxWpm) maxWpm = user.progress.wpm;
      if (user.progress.raw < minRaw && user.progress.raw > 0)
        minRaw = user.progress.raw;
      if (user.progress.wpm < minWpm && user.progress.wpm > 0)
        minWpm = user.progress.wpm;
    }
  });

  room.maxRaw = maxRaw;
  room.maxWpm = maxWpm;
  room.minRaw = minRaw === Infinity ? 0 : minRaw;
  room.minWpm = minWpm === Infinity ? 0 : minWpm;

  io.to(room.id).emit("room_progress_update", {
    users,
    roomMaxRaw: room.maxRaw,
    roomMaxWpm: room.maxWpm,
    roomMinRaw: room.minRaw,
    roomMinWpm: room.minWpm,
  });
}

export function updateProgress(
  io: TribesServer,
  socketId: string,
  progress: UserProgressOut,
): void {
  const room = roomStore.getRoomBySocketId(socketId);
  if (!room) return;

  const user = room.users[socketId];
  if (!user) return;

  user.progress = {
    ...progress,
    wpmProgress: progress.progress,
  };
  user.isTyping = true;
  user.isAfk = progress.afk;
}

export function submitResult(
  io: TribesServer,
  socketId: string,
  result: Result,
): void {
  const room = roomStore.getRoomBySocketId(socketId);
  if (!room) return;

  const user = room.users[socketId];
  if (!user) return;

  user.result = result;
  user.isFinished = true;
  user.isTyping = false;

  io.to(room.id).emit("room_user_result", { userId: socketId, result });

  // Check if this is the first player to finish
  const finishedCount = Object.values(room.users).filter(
    (u) => u.isFinished,
  ).length;
  const totalCount = Object.values(room.users).filter((u) => !u.isAfk).length;

  if (finishedCount === 1 && room.state === "RACE_ONGOING") {
    transitionRoom(io, room.id, "RACE_ONE_FINISHED");
  } else if (
    finishedCount >= totalCount &&
    room.state !== "RACE_AWAITING_RESULTS"
  ) {
    transitionRoom(io, room.id, "RACE_AWAITING_RESULTS");
  }
}

export function forceFinishRace(
  io: TribesServer,
  room: Room,
  reason: string,
): void {
  io.to(room.id).emit("room_race_force_finish", { reason });
  transitionRoom(io, room.id, "RACE_AWAITING_RESULTS");
}

export function initRace(io: TribesServer, socketId: string): boolean {
  const room = roomStore.getRoomBySocketId(socketId);
  if (!room) return false;

  if (!roomStore.isLeader(socketId)) {
    return false;
  }

  if (room.state !== "LOBBY" && room.state !== "READY_TO_CONTINUE") {
    return false;
  }

  return transitionRoom(io, room.id, "RACE_INIT");
}

export function backToLobby(io: TribesServer, socketId: string): void {
  const room = roomStore.getRoomBySocketId(socketId);
  if (!room) return;

  if (room.state === "SHOWING_RESULTS" || room.state === "READY_TO_CONTINUE") {
    transitionRoom(io, room.id, "LOBBY");
  }
}

// import type { Server } from "socket.io";
// import { roomStore } from "../stores/room-store.js";
// import { timerService, TimerType } from "./timer-service.js";
// import {
//   calculateFinalPositions,
//   calculateMiniCrowns,
// } from "./points-service.js";
// import type {
//   Room,
//   RoomState,
//   UserProgress,
//   UserProgressOut,
//   Result,
// } from "../types/room.js";
// import type {
//   ClientToServerEvents,
//   ServerToClientEvents,
//   InterServerEvents,
//   SocketData,
// } from "../types/events.js";
// import { generateSeed } from "../utils/id-generator.js";
// import Logger from "../utils/logger.js";
//
// type TribesServer = Server<
//   ClientToServerEvents,
//   ServerToClientEvents,
//   InterServerEvents,
//   SocketData
// >;
//
// const COUNTDOWN_DURATION = 5000;
// const COUNTDOWN_INTERVAL = 1000;
// const FINISH_TIMER_DURATION = 15000;
// const READY_TIMER_DURATION = 10000;
// const PROGRESS_UPDATE_INTERVAL = 100;
//
// const validTransitions: Record<RoomState, RoomState[]> = {
//   LOBBY: ["RACE_INIT"],
//   RACE_INIT: ["RACE_COUNTDOWN", "LOBBY"],
//   RACE_COUNTDOWN: ["RACE_ONGOING", "LOBBY"],
//   RACE_ONGOING: ["RACE_ONE_FINISHED", "RACE_AWAITING_RESULTS", "LOBBY"],
//   RACE_ONE_FINISHED: ["RACE_AWAITING_RESULTS", "LOBBY"],
//   RACE_AWAITING_RESULTS: ["SHOWING_RESULTS", "LOBBY"],
//   SHOWING_RESULTS: ["READY_TO_CONTINUE", "LOBBY", "RACE_INIT"],
//   READY_TO_CONTINUE: ["LOBBY", "RACE_INIT"],
// };
//
// export function canTransition(from: RoomState, to: RoomState): boolean {
//   return validTransitions[from]?.includes(to) ?? false;
// }
//
// export function transitionRoom(
//   io: TribesServer,
//   roomId: string,
//   newState: RoomState,
// ): boolean {
//   const room = roomStore.getRoom(roomId);
//   if (!room) return false;
//
//   if (!canTransition(room.state, newState)) {
//     Logger.warning(`Invalid state transition: ${room.state} -> ${newState}`);
//     return false;
//   }
//
//   room.state = newState;
//   io.to(roomId).emit("room_state_changed", { state: newState });
//   handleStateEntry(io, room, newState);
//   return true;
// }
//
// function handleStateEntry(
//   io: TribesServer,
//   room: Room,
//   state: RoomState,
// ): void {
//   switch (state) {
//     case "RACE_INIT":
//       handleRaceInit(io, room);
//       break;
//     case "RACE_COUNTDOWN":
//       handleRaceCountdown(io, room);
//       break;
//     case "RACE_ONGOING":
//       handleRaceOngoing(io, room);
//       break;
//     case "RACE_ONE_FINISHED":
//       handleRaceOneFinished(io, room);
//       break;
//     case "RACE_AWAITING_RESULTS":
//       handleRaceAwaitingResults(io, room);
//       break;
//     case "SHOWING_RESULTS":
//       handleShowingResults(io, room);
//       break;
//     case "READY_TO_CONTINUE":
//       handleReadyToContinue(io, room);
//       break;
//     case "LOBBY":
//       handleBackToLobby(io, room);
//       break;
//   }
// }
//
// function handleRaceInit(io: TribesServer, room: Room): void {
//   room.seed = generateSeed();
//   room.maxRaw = 0;
//   room.maxWpm = 0;
//   room.minRaw = Infinity;
//   room.minWpm = Infinity;
//
//   // Initialize practice/final cycle
//   if ((room as any).raceIteration == null) {
//     (room as any).raceIteration = 0; // 0=P1, 1=P2, 2=Final
//   }
//
//   Object.values(room.users).forEach((user) => {
//     user.isReady = false;
//     user.isFinished = false;
//     user.isTyping = false;
//     user.result = undefined;
//     user.progress = undefined;
//   });
//
//   io.to(room.id).emit("room_init_race", {
//     seed: room.seed,
//     phase:
//       (room as any).raceIteration === 0
//         ? "practice_1"
//         : (room as any).raceIteration === 1
//           ? "practice_2"
//           : "final",
//   });
//
//   setTimeout(() => {
//     if (room.state === "RACE_INIT") {
//       transitionRoom(io, room.id, "RACE_COUNTDOWN");
//     }
//   }, 500);
// }
//
// function handleRaceCountdown(io: TribesServer, room: Room): void {
//   timerService.start(room.id, TimerType.COUNTDOWN, {
//     duration: COUNTDOWN_DURATION,
//     interval: COUNTDOWN_INTERVAL,
//     onTick: (time) => {
//       io.to(room.id).emit("room_countdown", {
//         time: Math.ceil(time / 1000),
//       });
//     },
//     onComplete: () => {
//       if (room.state === "RACE_COUNTDOWN") {
//         transitionRoom(io, room.id, "RACE_ONGOING");
//       }
//     },
//   });
//
//   io.to(room.id).emit("room_countdown", {
//     time: COUNTDOWN_DURATION / 1000,
//   });
// }
//
// function handleRaceOngoing(io: TribesServer, room: Room): void {
//   io.to(room.id).emit("room_race_started");
//
//   timerService.start(room.id, TimerType.PROGRESS, {
//     duration: Infinity,
//     interval: PROGRESS_UPDATE_INTERVAL,
//     onTick: () => broadcastProgress(io, room),
//   });
// }
//
// function handleRaceOneFinished(io: TribesServer, room: Room): void {
//   timerService.start(room.id, TimerType.FINISH, {
//     duration: FINISH_TIMER_DURATION,
//     interval: 1000,
//     onTick: (time) => {
//       io.to(room.id).emit("room_finishTimer_countdown", {
//         time: Math.ceil(time / 1000),
//       });
//     },
//     onComplete: () => {
//       if (
//         room.state === "RACE_ONE_FINISHED" ||
//         room.state === "RACE_ONGOING"
//       ) {
//         forceFinishRace(io, room, "Time limit reached");
//       }
//     },
//   });
// }
//
// function handleRaceAwaitingResults(io: TribesServer, room: Room): void {
//   timerService.clear(`${room.id}:${TimerType.PROGRESS}`);
//   timerService.clear(`${room.id}:${TimerType.FINISH}`);
//
//   setTimeout(() => {
//     if (room.state === "RACE_AWAITING_RESULTS") {
//       transitionRoom(io, room.id, "SHOWING_RESULTS");
//     }
//   }, 1000);
// }
//
// function handleShowingResults(io: TribesServer, room: Room): void {
//   const positions = calculateFinalPositions(room);
//   const miniCrowns = calculateMiniCrowns(room);
//
//   const iteration = (room as any).raceIteration ?? 0;
//   const isFinal = iteration === 2;
//
//   io.to(room.id).emit("room_final_positions", {
//     positions,
//     miniCrowns,
//     isFinal,
//   });
//
//   if (isFinal) {
//     Logger.info(`Final race completed for room ${room.id}`);
//     (room as any).raceIteration = 0;
//
//     setTimeout(() => {
//       transitionRoom(io, room.id, "READY_TO_CONTINUE");
//     }, 3000);
//   } else {
//     (room as any).raceIteration++;
//
//     setTimeout(() => {
//       transitionRoom(io, room.id, "RACE_INIT");
//     }, 3000);
//   }
// }
//
// function handleReadyToContinue(io: TribesServer, room: Room): void {
//   timerService.start(room.id, TimerType.READY, {
//     duration: READY_TIMER_DURATION,
//     interval: 1000,
//     onTick: (time) => {
//       io.to(room.id).emit("room_readyTimer_countdown", {
//         time: Math.ceil(time / 1000),
//       });
//     },
//     onComplete: () => {
//       io.to(room.id).emit("room_readyTimer_over");
//       if (room.state === "READY_TO_CONTINUE") {
//         transitionRoom(io, room.id, "LOBBY");
//       }
//     },
//   });
// }
//
// function handleBackToLobby(io: TribesServer, room: Room): void {
//   timerService.clearAllForRoom(room.id);
//   roomStore.resetRoomForNextRace(room.id);
//   delete (room as any).raceIteration;
//   io.to(room.id).emit("room_back_to_lobby");
// }
//
// function broadcastProgress(io: TribesServer, room: Room): void {
//   const users: Record<string, UserProgress> = {};
//   let maxRaw = 0;
//   let maxWpm = 0;
//   let minRaw = Infinity;
//   let minWpm = Infinity;
//
//   Object.entries(room.users).forEach(([id, user]) => {
//     if (!user.progress) return;
//
//     users[id] = user.progress;
//     maxRaw = Math.max(maxRaw, user.progress.raw);
//     maxWpm = Math.max(maxWpm, user.progress.wpm);
//
//     if (user.progress.raw > 0) minRaw = Math.min(minRaw, user.progress.raw);
//     if (user.progress.wpm > 0) minWpm = Math.min(minWpm, user.progress.wpm);
//   });
//
//   room.maxRaw = maxRaw;
//   room.maxWpm = maxWpm;
//   room.minRaw = minRaw === Infinity ? 0 : minRaw;
//   room.minWpm = minWpm === Infinity ? 0 : minWpm;
//
//   io.to(room.id).emit("room_progress_update", {
//     users,
//     roomMaxRaw: room.maxRaw,
//     roomMaxWpm: room.maxWpm,
//     roomMinRaw: room.minRaw,
//     roomMinWpm: room.minWpm,
//   });
// }
//
// export function updateProgress(
//   io: TribesServer,
//   socketId: string,
//   progress: UserProgressOut,
// ): void {
//   const room = roomStore.getRoomBySocketId(socketId);
//   if (!room) return;
//
//   const user = room.users[socketId];
//   if (!user) return;
//
//   user.progress = {
//     ...progress,
//     wpmProgress: progress.progress,
//   };
//   user.isTyping = true;
//   user.isAfk = progress.afk;
// }
//
// export function submitResult(
//   io: TribesServer,
//   socketId: string,
//   result: Result,
// ): void {
//   const room = roomStore.getRoomBySocketId(socketId);
//   if (!room) return;
//
//   const user = room.users[socketId];
//   if (!user) return;
//
//   user.result = result;
//   user.isFinished = true;
//   user.isTyping = false;
//
//   io.to(room.id).emit("room_user_result", { userId: socketId, result });
//
//   const finishedCount = Object.values(room.users).filter(
//     (u) => u.isFinished,
//   ).length;
//   const totalCount = Object.values(room.users).filter((u) => !u.isAfk).length;
//
//   if (finishedCount === 1 && room.state === "RACE_ONGOING") {
//     transitionRoom(io, room.id, "RACE_ONE_FINISHED");
//   } else if (
//     finishedCount >= totalCount &&
//     room.state !== "RACE_AWAITING_RESULTS"
//   ) {
//     transitionRoom(io, room.id, "RACE_AWAITING_RESULTS");
//   }
// }
//
// export function forceFinishRace(
//   io: TribesServer,
//   room: Room,
//   reason: string,
// ): void {
//   io.to(room.id).emit("room_race_force_finish", { reason });
//   transitionRoom(io, room.id, "RACE_AWAITING_RESULTS");
// }
//
// export function initRace(io: TribesServer, socketId: string): boolean {
//   const room = roomStore.getRoomBySocketId(socketId);
//   if (!room) return false;
//   if (!roomStore.isLeader(socketId)) return false;
//   if (room.state !== "LOBBY" && room.state !== "READY_TO_CONTINUE") {
//     return false;
//   }
//   return transitionRoom(io, room.id, "RACE_INIT");
// }
//
// export function backToLobby(io: TribesServer, socketId: string): void {
//   const room = roomStore.getRoomBySocketId(socketId);
//   if (!room) return;
//
//   if (room.state === "SHOWING_RESULTS" || room.state === "READY_TO_CONTINUE") {
//     transitionRoom(io, room.id, "LOBBY");
//   }
// }

import type {
  Room,
  Result,
  FinalPositions,
  MiniCrowns,
} from "../types/room.js";

const POSITION_POINTS = [10, 7, 5, 4, 3, 2, 1, 0];

export function calculateFinalPositions(room: Room): FinalPositions {
  const finishedUsers = Object.values(room.users)
    .filter((u) => u.result && u.isFinished)
    .sort((a, b) => (b.result?.wpm ?? 0) - (a.result?.wpm ?? 0));

  const positions: FinalPositions = {};
  let currentPosition = 1;
  let lastWpm: number | null = null;
  let playersInPreviousPositions = 0;

  for (const user of finishedUsers) {
    const wpm = user.result?.wpm ?? 0;

    // Handle ties (same WPM = same position)
    if (lastWpm !== null && wpm !== lastWpm) {
      currentPosition = playersInPreviousPositions + 1;
    }

    const points = POSITION_POINTS[currentPosition - 1] ?? 0;
    const newPointsTotal = (user.points ?? 0) + points;

    positions[currentPosition] ??= [];

    const positionArray = positions[currentPosition];
    if (positionArray) {
      positionArray.push({
        id: user.id,
        newPoints: points,
        newPointsTotal,
      });
    }

    // Update user's total points
    user.points = newPointsTotal;
    lastWpm = wpm;
    playersInPreviousPositions++;
  }

  return positions;
}

export function calculateMiniCrowns(room: Room): MiniCrowns {
  const users = Object.values(room.users).filter((u) => u.result);

  const getWinners = (metric: keyof Result): string[] => {
    if (users.length === 0) return [];

    const values = users.map((u) => {
      const val = u.result?.[metric];
      return typeof val === "number" ? val : 0;
    });
    const maxValue = Math.max(...values);

    if (maxValue === 0) return [];

    return users
      .filter((u) => {
        const val = u.result?.[metric];
        return typeof val === "number" && val === maxValue;
      })
      .map((u) => u.id);
  };

  return {
    wpm: getWinners("wpm"),
    raw: getWinners("raw"),
    acc: getWinners("acc"),
    consistency: getWinners("consistency"),
  };
}

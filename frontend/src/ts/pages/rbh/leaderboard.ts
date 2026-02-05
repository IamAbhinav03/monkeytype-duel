import Page from "../../pages/page";
import { qs, ElementWithUtils, createElementWithUtils } from "../../utils/dom";

type LeaderboardEntry = {
  name: string;
  wpm: number;
  acc: number;
  raw: number;
  consistency: number;
  date: number;
};

// State
let entries: LeaderboardEntry[] = [];

function createRow(entry: LeaderboardEntry, rank: number): ElementWithUtils {
  const row = createElementWithUtils("div", {
    classList: ["leaderboardRow"],
    dataset: { name: entry.name },
  });

  const isPlaceholder = entry.wpm === -1;

  const formatStat = (val: number, isPct: boolean = false): string | number => {
    if (isPlaceholder) return "-";
    return isPct ? Math.floor(val) + "%" : Math.round(val);
  };

  const formatFloat = (val: number, isPct: boolean = false): string => {
    if (isPlaceholder) return "-";
    return isPct ? val.toFixed(2) + "%" : val.toFixed(2);
  };

  const dateStr =
    !isPlaceholder && entry.date > 0
      ? new Date(entry.date).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "-";

  row.setHtml(`
        <div class="col rank">${rank}</div>
        <div class="col name">
            <div class="avatarNameBadge">
                 <div class="avatar"><i class="fas fa-user-circle"></i></div>
                 <div class="name">${entry.name}</div>
            </div>
        </div>
        <div class="col stat narrow">${formatStat(entry.wpm)}</div>
        <div class="col stat narrow">${formatStat(entry.raw)}</div>
        <div class="col stat wide">${formatFloat(entry.wpm)}</div>
        <div class="col stat wide">${formatFloat(entry.acc, true)}</div>
        <div class="col stat wide">${formatFloat(entry.raw)}</div>
        <div class="col stat wide">${formatFloat(entry.consistency, true)}</div>
        <div class="col date">${dateStr}</div>
    `);

  return row;
}

function init(initialData: LeaderboardEntry[]): void {
  entries = [...initialData].sort((a, b) => b.wpm - a.wpm);
  const container = qs("#leaderboardBody");
  if (container === null) return;

  container.empty();
  entries.forEach((e, i) => {
    container.append(createRow(e, i + 1));
  });
}

function update(updatedEntry: LeaderboardEntry): void {
  const container = qs("#leaderboardBody");
  if (container === null) return;

  // 1. Update Data
  const idx = entries.findIndex((e) => e.name === updatedEntry.name);
  if (idx !== -1) entries[idx] = updatedEntry;
  else entries.push(updatedEntry);

  // 2. Snapshot (First)
  const oldPositions = new Map<string, number>();
  container.qsa(".leaderboardRow").forEach((row) => {
    const name = row.native.dataset["name"];
    if (name !== undefined && name !== "") {
      oldPositions.set(name, row.native.getBoundingClientRect().top);
    }
  });

  // 3. Re-render (Last)
  entries.sort((a, b) => b.wpm - a.wpm);
  container.empty();
  entries.forEach((e, i) => {
    container.append(createRow(e, i + 1));
  });

  // 4. Invert & Play
  container.qsa(".leaderboardRow").forEach((row) => {
    const name = row.native.dataset["name"];
    if (name === undefined || name === "") return;

    const oldTop = oldPositions.get(name);
    const newTop = row.native.getBoundingClientRect().top;

    if (oldTop !== undefined) {
      const delta = oldTop - newTop;
      const isTarget = name === updatedEntry.name;

      if (delta !== 0 || isTarget) {
        // Animate if moved OR if it's the target (for pop effect)

        // 3D Pop Out for Target
        if (isTarget) {
          row.native.style.zIndex = "100";
          row.native.style.position = "relative";
          // Grow -> Glide -> Settle
          row.animate({
            translateY: [delta, delta, 0],
            scale: [1, 1.1, 1.1, 1],
            boxShadow: [
              "0 0 0 0 rgba(0,0,0,0)",
              "0 15px 30px rgba(0,200,255,0.4)",
              "0 15px 30px rgba(0,200,255,0.4)",
              "0 0 0 0 rgba(0,0,0,0)",
            ],
            duration: 900,
            easing: "easeOutQuint",
          });
        } else {
          // Simple slide for others
          row.animate({
            translateY: [delta, 0],
            duration: 600,
            easing: "easeOutQuint",
          });
        }
      }
    } else {
      // New Entry Fade In
      row.animate({ opacity: [0, 1], duration: 300 });
    }
  });
}

export const page = new Page({
  id: "rbhLeaderboard",
  element: qs("#pageRbhLeaderboard") as ElementWithUtils,
  path: "/rbh/leaderboard",
  afterShow: async () => {
    // DUMMY DATA HARNESS
    const testData: LeaderboardEntry[] = [
      {
        name: "Verstappen",
        wpm: 180,
        acc: 99,
        raw: 185,
        consistency: 98,
        date: 1700000000000,
      },
      {
        name: "Norris",
        wpm: 175,
        acc: 98,
        raw: 180,
        consistency: 97,
        date: 1700000000000,
      },
      {
        name: "Leclerc",
        wpm: 170,
        acc: 99,
        raw: 175,
        consistency: 96,
        date: 1700000000000,
      },
      {
        name: "Hamilton",
        wpm: 165,
        acc: 97,
        raw: 170,
        consistency: 99,
        date: 1700000000000,
      },
      {
        name: "Piastri",
        wpm: 160,
        acc: 98,
        raw: 165,
        consistency: 95,
        date: 1700000000000,
      },
    ];

    // 1. Init with Empty stats (Sorted alphabetically for neutrality)
    const placeholders = testData
      .map((d) => ({
        ...d,
        wpm: -1,
        acc: -1,
        raw: -1,
        consistency: -1,
        date: -1,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    init(placeholders);

    // 2. Reveal stats one by one
    testData.forEach((realEntry, idx) => {
      setTimeout(
        () => {
          update(realEntry);
        },
        1000 + idx * 800,
      );
    });

    // 3. Simulate Overtake
    const hamiltonEntry = testData[3];
    if (hamiltonEntry) {
      setTimeout(() => {
        update({
          name: hamiltonEntry.name,
          wpm: 200,
          acc: hamiltonEntry.acc,
          raw: hamiltonEntry.raw,
          consistency: hamiltonEntry.consistency,
          date: hamiltonEntry.date,
        }); // Hamilton gets fast
      }, 7000);
    }
  },
});

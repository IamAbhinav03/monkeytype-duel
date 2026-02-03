import Page from "./page";
import { qsr } from "../utils/dom";

export const page = new Page({
  id: "duelleaderboard",
  element: qsr(".page.pageDuelleaderboard"),
  path: "/duelleaderboard",
  beforeShow: async (): Promise<void> => {
    updateTimeLeft(30);
    updatePlayer(1, "Player 1", 0);
    updatePlayer(2, "Player 2", 0);
    updateArrow(0);
  },
});

function getEl(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function updateTimeLeft(seconds: number): void {
  const el = getEl("duelTimeLeft");
  if (el) el.textContent = String(seconds);
}

export function updatePlayer(
  playerNum: number,
  name: string,
  wpm: number,
): void {
  const playerEl = getEl(`duelPlayer${playerNum}`);
  if (!playerEl) return;
  const nameEl = playerEl.querySelector(".name");
  const wpmEl = playerEl.querySelector(".wpm");
  if (nameEl) nameEl.textContent = name;
  if (wpmEl) wpmEl.textContent = `${wpm} WPM`;
}

// leading: 0 = tie/none, 1 = player1, 2 = player2
export function updateArrow(leading: number): void {
  const arrow = getEl("duelLeaderArrow");
  if (!arrow) return;
  if (leading === 1) {
    arrow.style.transform = "translateY(-36px)";
    arrow.setAttribute("aria-label", "player1-leading");
  } else if (leading === 2) {
    arrow.style.transform = "translateY(36px)";
    arrow.setAttribute("aria-label", "player2-leading");
  } else {
    arrow.style.transform = "translateY(0)";
    arrow.setAttribute("aria-label", "tie");
  }
}

export default { updateTimeLeft, updatePlayer, updateArrow };

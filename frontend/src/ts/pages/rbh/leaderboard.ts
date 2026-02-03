import Page from "../../pages/page";
import { qs, ElementWithUtils } from "../../utils/dom";

export const page = new Page({
  id: "rbhLeaderboard",
  element: qs("#pageRbhLeaderboard") as ElementWithUtils,
  path: "/rbh/leaderboard",
  afterShow: async () => {
    // Static table is already in HTML, no dynamic logic needed for now
    return Promise.resolve();
  },
});

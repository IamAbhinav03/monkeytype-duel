import Page from "../page";
import { qsr } from "../../utils/dom";
import { isDuelModeEnabled } from "../../utils/tribe";
import * as DuelState from "../../tribe/duel/duel-state";

export const page = new Page({
  id: "waiting",
  element: qsr(".page.pageWaiting"),
  path: "/waiting",
  afterShow: async () => {
    // In duel mode, show the message set by DuelFlow
    if (isDuelModeEnabled()) {
      const message = DuelState.consumeWaitingPageMessage();
      if (message !== undefined && message !== "") {
        const messageEl = document.querySelector(".pageWaiting .message");
        if (messageEl) {
          messageEl.textContent = message;
        }
      }
    }
  },
});

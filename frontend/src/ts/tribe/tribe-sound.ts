import { Howl } from "howler";
import * as TribeState from "../tribe/tribe-state";
import { isDuelModeEnabled } from "../utils/tribe";

const sounds: Record<string, Howl> = {
  join: new Howl({ src: "/sound/tribe-sounds/join.wav" }),
  leave: new Howl({ src: "/sound/tribe-sounds/leave.wav" }),
  start: new Howl({ src: "/sound/tribe-sounds/start.wav" }),
  chat: new Howl({ src: "/sound/tribe-sounds/chat.wav" }),
  chat_mention: new Howl({ src: "/sound/tribe-sounds/chat_mention.wav" }),
  finish: new Howl({ src: "/sound/tribe-sounds/finish.wav" }),
  finish_win: new Howl({ src: "./sound/tribe-sounds/finish_win.wav" }),
  glow: new Howl({ src: "/sound/tribe-sounds/glow.wav" }),
  cd: new Howl({ src: "/sound/tribe-sounds/cd2.wav" }),
  cd_go: new Howl({ src: "/sound/tribe-sounds/cd_go2.wav" }),
};

export function play(name: string): void {
  if (
    TribeState.getSelf()?.isTyping === true &&
    ["join", "leave", "chat", "chat_mention"].includes(name)
  ) {
    return;
  }
  // In duel mode, always allow countdown sounds (typing isn't enabled until countdown finishes)
  if (
    !TribeState.getSelf()?.isTyping &&
    ["cd", "cd_go"].includes(name) &&
    !isDuelModeEnabled()
  ) {
    return;
  }
  sounds[name]?.seek(0);
  sounds[name]?.play();
}

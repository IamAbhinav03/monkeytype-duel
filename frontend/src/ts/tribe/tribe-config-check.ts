import { getRoom, getSelf } from "./tribe-state";
import * as DuelState from "./duel/duel-state";

export function canChangeConfig(override: boolean): boolean {
  // During duel flow, config must remain locked unless the duel controller
  // explicitly overrides it for deterministic practice/race setup.
  if (DuelState.getFlowState() !== "SYSTEM_SELECT") {
    return override;
  }

  const room = getRoom();

  if (room === undefined) return true;

  if (getSelf()?.isLeader) {
    if (
      room.state !== "LOBBY" &&
      room.state !== "READY_TO_CONTINUE" &&
      room.state !== "SHOWING_RESULTS"
    ) {
      return false;
    }
    //is leader, allow
    return true;
  } else {
    //not leader, check if its being forced by tribe
    if (override) {
      return true;
    } else {
      return false;
    }
  }
}

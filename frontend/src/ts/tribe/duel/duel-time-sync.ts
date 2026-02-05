// Time synchronization with server for synchronized race starts
// Uses 3 samples with median to get robust server offset

import Socket from "../tribe-socket/socket";

let serverOffset = 0; // serverTime - clientTime
let synced = false;

/**
 * Perform time sync with server.
 * Takes 3 RTT samples and uses median for offset calculation.
 */
export async function sync(): Promise<void> {
  const samples: number[] = [];

  // Take 3 samples for median
  for (let i = 0; i < 3; i++) {
    const offset = await singleSync();
    samples.push(offset);

    // Small delay between samples
    if (i < 2) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  // Use median
  samples.sort((a, b) => a - b);
  serverOffset = samples[1] ?? 0;
  synced = true;

  console.log(
    `[DuelTimeSync] Sync complete. Server offset: ${serverOffset}ms, samples: [${samples.join(", ")}]`,
  );
}

/**
 * Perform a single time sync sample.
 * Returns the calculated offset.
 */
async function singleSync(): Promise<number> {
  return new Promise((resolve) => {
    const clientSend = Date.now();

    Socket.emit(
      "duel_time_sync",
      { clientTime: clientSend },
      (response: { clientTime: number; serverTime: number }) => {
        const clientReceive = Date.now();
        const roundTrip = clientReceive - clientSend;
        const estimatedServerTime = response.serverTime + roundTrip / 2;
        const offset = estimatedServerTime - clientReceive;

        resolve(offset);
      },
    );
  });
}

/**
 * Get current server time (estimated).
 */
export function getServerNow(): number {
  return Date.now() + serverOffset;
}

/**
 * Get the calculated server offset.
 */
export function getOffset(): number {
  return serverOffset;
}

/**
 * Check if time sync has been performed.
 */
export function isSynced(): boolean {
  return synced;
}

/**
 * Schedule a callback to execute at a specific server timestamp.
 * Returns a timeout ID that can be used to cancel.
 */
export function scheduleAt(
  serverTimestamp: number,
  callback: () => void,
): ReturnType<typeof setTimeout> {
  const clientTime = serverTimestamp - serverOffset;
  const delay = clientTime - Date.now();

  console.log(
    `[DuelTimeSync] Scheduling callback for server time ${serverTimestamp}, client time ${clientTime}, delay ${delay}ms`,
  );

  if (delay <= 0) {
    // Already past, execute immediately
    console.log(`[DuelTimeSync] Time already passed, executing immediately`);
    callback();
    // Return a dummy timeout ID for consistency
    return setTimeout((): void => {
      /* noop */
    }, 0);
  }

  return setTimeout(callback, delay);
}

/**
 * Reset sync state.
 */
export function reset(): void {
  synced = false;
  serverOffset = 0;
}

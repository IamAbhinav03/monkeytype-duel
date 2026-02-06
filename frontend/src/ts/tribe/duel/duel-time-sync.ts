// Time synchronization with server for synchronized race starts
// Uses 3 samples with median to get robust server offset

import Socket from "../tribe-socket/socket";

let serverOffset = 0; // serverTime - clientTime
let synced = false;
const TIME_SYNC_ACK_TIMEOUT_MS = 3000;
const TIME_SYNC_SAMPLE_COUNT = 3;

/**
 * Perform time sync with server.
 * Takes 3 RTT samples and uses median for offset calculation.
 */
export async function sync(): Promise<void> {
  const samples: number[] = [];

  // Take N samples for median
  for (let i = 0; i < TIME_SYNC_SAMPLE_COUNT; i++) {
    const offset = await singleSync();
    if (offset !== null) {
      samples.push(offset);
    }

    // Small delay between samples
    if (i < TIME_SYNC_SAMPLE_COUNT - 1) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  if (samples.length === 0) {
    synced = false;
    serverOffset = 0;
    console.warn(
      "[DuelTimeSync] Sync failed (no valid samples), using local clock",
    );
    return;
  }

  // Use median
  samples.sort((a, b) => a - b);
  const medianIndex = Math.floor(samples.length / 2);
  serverOffset = samples[medianIndex] ?? 0;
  synced = true;

  console.log(
    `[DuelTimeSync] Sync complete. Server offset: ${serverOffset}ms, samples: [${samples.join(", ")}]`,
  );
}

/**
 * Perform a single time sync sample.
 * Returns the calculated offset.
 */
async function singleSync(): Promise<number | null> {
  const clientSend = Date.now();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const ackPromise = new Promise<{ clientTime: number; serverTime: number }>(
    (resolve) => {
      Socket.emit(
        "duel_time_sync",
        { clientTime: clientSend },
        (response: { clientTime: number; serverTime: number }) => {
          resolve(response);
        },
      );
    },
  );

  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve(null);
    }, TIME_SYNC_ACK_TIMEOUT_MS);
  });

  const response = await Promise.race<
    [typeof ackPromise, typeof timeoutPromise][number]
  >([ackPromise, timeoutPromise]);

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  if (response === null) {
    console.warn(
      `[DuelTimeSync] duel_time_sync ACK timeout after ${TIME_SYNC_ACK_TIMEOUT_MS}ms`,
    );
    return null;
  }

  if (
    typeof response.serverTime !== "number" ||
    !Number.isFinite(response.serverTime)
  ) {
    return null;
  }

  const clientReceive = Date.now();
  const roundTrip = clientReceive - clientSend;
  const estimatedServerTime = response.serverTime + roundTrip / 2;
  const offset = estimatedServerTime - clientReceive;

  return offset;
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

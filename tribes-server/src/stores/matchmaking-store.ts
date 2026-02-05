import { MATCHMAKING_QUEUE } from "@monkeytype/schemas/tribes";

export { MATCHMAKING_QUEUE };

export type MatchmakingQueueIndex = 0 | 1 | 2 | 3;

type QueueEntry = {
  socketId: string;
  name: string;
  joinedAt: number;
  queues: MatchmakingQueueIndex[];
};

class MatchmakingStore {
  private queues: Map<MatchmakingQueueIndex, Set<string>> = new Map([
    [MATCHMAKING_QUEUE.TIME_15, new Set()],
    [MATCHMAKING_QUEUE.TIME_60, new Set()],
    [MATCHMAKING_QUEUE.MEDIUM_QUOTES, new Set()],
    [MATCHMAKING_QUEUE.LONG_QUOTES, new Set()],
  ]);

  private entries: Map<string, QueueEntry> = new Map();

  join(socketId: string, name: string, queues: MatchmakingQueueIndex[]): void {
    // Remove from any existing queues first
    this.leave(socketId);

    const entry: QueueEntry = {
      socketId,
      name,
      joinedAt: Date.now(),
      queues,
    };

    this.entries.set(socketId, entry);

    queues.forEach((queue) => {
      this.queues.get(queue)?.add(socketId);
    });
  }

  leave(socketId: string): void {
    const entry = this.entries.get(socketId);
    if (entry) {
      entry.queues.forEach((queue) => {
        this.queues.get(queue)?.delete(socketId);
      });
      this.entries.delete(socketId);
    }
  }

  getEntry(socketId: string): QueueEntry | undefined {
    return this.entries.get(socketId);
  }

  getPlayersInQueue(queue: MatchmakingQueueIndex): string[] {
    const queueSet = this.queues.get(queue);
    return queueSet ? Array.from(queueSet) : [];
  }

  getQueueLengths(): [number, number, number, number] {
    return [
      this.queues.get(MATCHMAKING_QUEUE.TIME_15)?.size ?? 0,
      this.queues.get(MATCHMAKING_QUEUE.TIME_60)?.size ?? 0,
      this.queues.get(MATCHMAKING_QUEUE.MEDIUM_QUOTES)?.size ?? 0,
      this.queues.get(MATCHMAKING_QUEUE.LONG_QUOTES)?.size ?? 0,
    ];
  }

  findMatch(
    minPlayers = 2,
  ): { queue: MatchmakingQueueIndex; players: QueueEntry[] } | null {
    for (const queue of [
      MATCHMAKING_QUEUE.TIME_15,
      MATCHMAKING_QUEUE.TIME_60,
      MATCHMAKING_QUEUE.MEDIUM_QUOTES,
      MATCHMAKING_QUEUE.LONG_QUOTES,
    ] as MatchmakingQueueIndex[]) {
      const queueSet = this.queues.get(queue);
      if (queueSet && queueSet.size >= minPlayers) {
        // Get players in this queue, sorted by join time
        const players = Array.from(queueSet)
          .map((id) => this.entries.get(id))
          .filter((entry): entry is QueueEntry => entry !== undefined)
          .sort((a, b) => a.joinedAt - b.joinedAt)
          .slice(0, 8); // Max 8 players

        if (players.length >= minPlayers) {
          // Remove matched players from all queues
          players.forEach((player) => this.leave(player.socketId));
          return { queue, players };
        }
      }
    }
    return null;
  }

  getTotalInQueue(): number {
    return this.entries.size;
  }
}

export const matchmakingStore = new MatchmakingStore();

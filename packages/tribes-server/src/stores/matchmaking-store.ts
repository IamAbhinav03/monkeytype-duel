export enum MatchmakingQueue {
  TIME_15 = 0,
  TIME_60 = 1,
  MEDIUM_QUOTES = 2,
  LONG_QUOTES = 3,
}

type QueueEntry = {
  socketId: string;
  name: string;
  joinedAt: number;
  queues: MatchmakingQueue[];
};

class MatchmakingStore {
  private queues: Map<MatchmakingQueue, Set<string>> = new Map([
    [MatchmakingQueue.TIME_15, new Set()],
    [MatchmakingQueue.TIME_60, new Set()],
    [MatchmakingQueue.MEDIUM_QUOTES, new Set()],
    [MatchmakingQueue.LONG_QUOTES, new Set()],
  ]);

  private entries: Map<string, QueueEntry> = new Map();

  join(socketId: string, name: string, queues: MatchmakingQueue[]): void {
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

  getPlayersInQueue(queue: MatchmakingQueue): string[] {
    const queueSet = this.queues.get(queue);
    return queueSet ? Array.from(queueSet) : [];
  }

  getQueueLengths(): [number, number, number, number] {
    return [
      this.queues.get(MatchmakingQueue.TIME_15)?.size ?? 0,
      this.queues.get(MatchmakingQueue.TIME_60)?.size ?? 0,
      this.queues.get(MatchmakingQueue.MEDIUM_QUOTES)?.size ?? 0,
      this.queues.get(MatchmakingQueue.LONG_QUOTES)?.size ?? 0,
    ];
  }

  findMatch(
    minPlayers = 2,
  ): { queue: MatchmakingQueue; players: QueueEntry[] } | null {
    for (const queue of [
      MatchmakingQueue.TIME_15,
      MatchmakingQueue.TIME_60,
      MatchmakingQueue.MEDIUM_QUOTES,
      MatchmakingQueue.LONG_QUOTES,
    ]) {
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

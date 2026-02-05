export enum TimerType {
  COUNTDOWN = "countdown",
  FINISH = "finish",
  READY = "ready",
  PROGRESS = "progress",
  LOBBY_AUTO_START = "LOBBY_AUTO_START",
}

type TimerConfig = {
  duration: number;
  interval?: number;
  onTick?: (remaining: number) => void;
  onComplete: () => void;
};

class TimerService {
  private timers: Map<string, NodeJS.Timeout> = new Map();

  start(roomId: string, type: TimerType, config: TimerConfig): void {
    const key = `${roomId}:${type}`;
    this.clear(key);

    if (config.interval !== undefined && config.interval !== 0) {
      const interval = config.interval;
      let remaining = config.duration;
      const intervalId = setInterval(() => {
        config.onTick?.(remaining);
        remaining -= interval;
        if (remaining <= 0) {
          this.clear(key);
          config.onComplete();
        }
      }, config.interval);
      this.timers.set(key, intervalId);
    } else {
      const timeoutId = setTimeout(() => {
        this.clear(key);
        config.onComplete();
      }, config.duration);
      this.timers.set(key, timeoutId);
    }
  }

  clear(key: string): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      clearInterval(timer);
      this.timers.delete(key);
    }
  }

  clearAllForRoom(roomId: string): void {
    for (const key of this.timers.keys()) {
      if (key.startsWith(`${roomId}:`)) {
        this.clear(key);
      }
    }
  }

  isRunning(roomId: string, type: TimerType): boolean {
    return this.timers.has(`${roomId}:${type}`);
  }
}

export const timerService = new TimerService();

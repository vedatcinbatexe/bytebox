// Counts events per key within a sliding time window (in memory; one terminal instance)
export class SlidingWindowLimiter {
  private events = new Map<string, number[]>();

  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  // Records an event and returns false if the key is over the limit
  tryTake(key: string, now = Date.now()): boolean {
    const recent = (this.events.get(key) ?? []).filter((time) => now - time < this.windowMs);
    if (recent.length >= this.limit) {
      this.events.set(key, recent);
      return false;
    }
    recent.push(now);
    this.events.set(key, recent);
    return true;
  }
}

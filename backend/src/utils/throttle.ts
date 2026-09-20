/** Fixed one-second windows, shared by all sockets belonging to a user. */
export class UserThrottle {
  private buckets = new Map<string, { start: number; count: number }>();
  allow(key: string, now: number, limit: number): boolean {
    if (this.buckets.size > 10_000) {
      for (const [id, bucket] of this.buckets) if (now - bucket.start >= 1000) this.buckets.delete(id);
      if (this.buckets.size > 10_000 && !this.buckets.has(key)) return false;
    }
    const previous = this.buckets.get(key);
    const bucket = !previous || now - previous.start >= 1000 ? { start: now, count: 0 } : previous;
    this.buckets.set(key, bucket);
    return ++bucket.count <= limit;
  }
}

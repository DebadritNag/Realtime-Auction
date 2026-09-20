/** Serialization is local to one server process; swap for distributed ownership before scaling. */
export interface RoomLock { runExclusive<T>(key: string, action: () => Promise<T>): Promise<T> }
export class SerialQueue implements RoomLock {
  private readonly tails = new Map<string, Promise<void>>();
  async runExclusive<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const tail = new Promise<void>(resolve => { release = resolve; });
    this.tails.set(key, tail);
    await previous;
    try { return await action(); }
    finally { release(); if (this.tails.get(key) === tail) this.tails.delete(key); }
  }
}

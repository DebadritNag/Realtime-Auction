import type { Room } from '../../domain/types.js';
export interface Clock { now(): number }
export const systemClock: Clock = { now: () => Date.now() };
export class TimerService {
  private stopped = false;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(private clock: Clock, private onDue: (code: string, activationId: string | null) => Promise<void>,
    private onError: (error: unknown, code: string) => void) {}
  schedule(room: Room): void {
    if (this.stopped) return;
    this.clear(room.code);
    if (room.status !== 'RUNNING') return;
    const due = room.active?.endsAt ?? room.nextPlayerAt;
    if (due === null) return;
    const activationId = room.active?.activationId ?? null;
    const attempt = async () => {
      this.timers.delete(room.code);
      try { await this.onDue(room.code, activationId); }
      catch (error) {
        this.onError(error, room.code);
        // Persistence failures leave the committed state intact; retry the same transition.
        if (!this.stopped && !this.timers.has(room.code)) this.timers.set(room.code, setTimeout(attempt, 1000).unref());
      }
    };
    this.timers.set(room.code, setTimeout(attempt, Math.max(1, due - this.clock.now())).unref());
  }
  clear(code: string): void { const timer = this.timers.get(code); if (timer) clearTimeout(timer); this.timers.delete(code); }
  close(): void { this.stopped = true; for (const code of this.timers.keys()) this.clear(code); }
}

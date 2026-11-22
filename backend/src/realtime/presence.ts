import type { Sql } from 'postgres';

/** Persists when a user was last connected to a room, so "last seen" survives a server restart. */
export interface PresenceStore {
  load(code: string): Promise<Record<string, number>>;
  touch(code: string, userId: string, at: number): Promise<void>;
}
export class MemoryPresenceStore implements PresenceStore {
  private readonly data = new Map<string, Map<string, number>>();
  async load(code: string): Promise<Record<string, number>> { return Object.fromEntries(this.data.get(code) ?? []); }
  async touch(code: string, userId: string, at: number): Promise<void> {
    const room = this.data.get(code) ?? new Map<string, number>();
    room.set(userId, at); this.data.set(code, room);
  }
}
/** Best-effort store on public.live_room_presence. Failures are logged once and swallowed; callers never wait on or fail because of it. */
export class PostgresPresenceStore implements PresenceStore {
  private warned = false;
  constructor(private readonly sql: Sql, private warn: (message: string) => void = () => undefined) {}
  setWarn(warn: (message: string) => void): void { this.warn = warn; }
  private fail(): void {
    if (this.warned) return;
    this.warned = true;
    this.warn('Presence storage unavailable; last-seen is kept in memory only. Apply migration 20261004090000_live_room_presence.sql.');
  }
  async load(code: string): Promise<Record<string, number>> {
    try {
      const rows = await this.sql`select user_id, (extract(epoch from last_seen_at) * 1000)::bigint as at from public.live_room_presence where room_code=${code}` as unknown as Array<{ user_id: string; at: string | number }>;
      return Object.fromEntries(rows.map(r => [r.user_id, Number(r.at)]));
    } catch { this.fail(); return {}; }
  }
  async touch(code: string, userId: string, at: number): Promise<void> {
    try {
      await this.sql`insert into public.live_room_presence (room_code, user_id, last_seen_at) values (${code}, ${userId}, to_timestamp(${at}::double precision / 1000)) on conflict (room_code, user_id) do update set last_seen_at = excluded.last_seen_at`;
    } catch { this.fail(); }
  }
}
interface UserPresence { sockets: number; lastSeenAt: number | null }
interface RoomPresence { users: Map<string, UserPresence>; loaded?: Promise<void> }
export interface PresenceView { connected: boolean; lastSeenAt: number | null }

/** Per-room socket counts and last-seen times. A user with several sockets counts once. */
export class PresenceTracker {
  private readonly rooms = new Map<string, RoomPresence>();
  constructor(private readonly store: PresenceStore, private readonly now: () => number) {}
  private room(code: string): RoomPresence {
    let room = this.rooms.get(code);
    if (!room) { room = { users: new Map() }; this.rooms.set(code, room); }
    return room;
  }
  ensureLoaded(code: string): Promise<void> {
    const room = this.room(code);
    room.loaded ??= this.store.load(code).then(saved => {
      for (const [userId, at] of Object.entries(saved)) {
        const entry = room.users.get(userId) ?? { sockets: 0, lastSeenAt: null };
        if (entry.lastSeenAt === null || entry.lastSeenAt < at) entry.lastSeenAt = at;
        room.users.set(userId, entry);
      }
    }).catch(() => undefined);
    return room.loaded;
  }
  connect(code: string, userId: string): void {
    const room = this.room(code);
    const entry = room.users.get(userId) ?? { sockets: 0, lastSeenAt: null };
    entry.sockets++; entry.lastSeenAt = this.now(); room.users.set(userId, entry);
    if (entry.sockets === 1) void this.store.touch(code, userId, entry.lastSeenAt).catch(() => undefined);
  }
  disconnect(code: string, userId: string): void {
    const entry = this.rooms.get(code)?.users.get(userId);
    if (!entry || entry.sockets === 0) return;
    entry.sockets--; entry.lastSeenAt = this.now();
    if (entry.sockets === 0) void this.store.touch(code, userId, entry.lastSeenAt).catch(() => undefined);
  }
  connectedUserIds(code: string): string[] {
    return [...(this.rooms.get(code)?.users ?? [])].filter(([, u]) => u.sockets > 0).map(([id]) => id);
  }
  snapshot(code: string): Record<string, PresenceView> {
    return Object.fromEntries([...(this.rooms.get(code)?.users ?? [])].map(([id, u]) => [id, { connected: u.sockets > 0, lastSeenAt: u.lastSeenAt }]));
  }
}

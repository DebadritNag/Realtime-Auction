import type { JSONValue, Sql } from 'postgres';
import type { Room } from '../domain/types.js';
import type { RoomRepository } from './interfaces.js';
import { DomainError } from '../domain/errors.js';
/** Durable live-room storage: one row per room in public.live_room_snapshots.
 * commit is a single compare-and-set UPDATE, so it is atomic without an explicit transaction.
 * Never logs room state. */
export class PostgresLiveRoomRepository implements RoomRepository {
  constructor(private readonly sql: Sql) {}
  private json(room: Room) { return this.sql.json(JSON.parse(JSON.stringify(room)) as JSONValue); }
  async create(room: Room): Promise<void> {
    try {
      await this.sql`insert into public.live_room_snapshots (code, room_id, host_user_id, status, sequence, state) values (${room.code}, ${room.id}, ${room.hostUserId}, ${room.status}, ${room.sequence}, ${this.json(room)})`;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new DomainError('ROOM_CODE_CONFLICT', 'Room code already exists.', 409);
      throw error;
    }
  }
  async commit(room: Room, expectedSequence: number): Promise<void> {
    const rows = await this.sql`update public.live_room_snapshots set status=${room.status}, sequence=${room.sequence}, state=${this.json(room)}, updated_at=now() where code=${room.code} and sequence=${expectedSequence} returning sequence`;
    if (rows.length !== 1) throw new DomainError('VERSION_CONFLICT', 'Room version changed.', 409);
  }
  async findByCode(code: string): Promise<Room | null> {
    const rows = await this.sql<{ state: Room }[]>`select state from public.live_room_snapshots where code=${code}`;
    return rows[0]?.state ?? null;
  }
  async findById(id: string): Promise<Room | null> {
    const rows = await this.sql<{ state: Room }[]>`select state from public.live_room_snapshots where room_id=${id}`;
    return rows[0]?.state ?? null;
  }
  async listRecoverable(): Promise<Room[]> {
    const rows = await this.sql<{ state: Room }[]>`select state from public.live_room_snapshots order by created_at`;
    return rows.map(r => r.state);
  }
  async listActive(): Promise<Room[]> {
    const rows = await this.sql<{ state: Room }[]>`select state from public.live_room_snapshots where status <> 'COMPLETED' order by created_at`;
    return rows.map(r => r.state);
  }
  async listForUser(userId: string): Promise<Room[]> {
    const rows = await this.sql<{ state: Room }[]>`select state from public.live_room_snapshots where exists (select 1 from jsonb_array_elements(state->'teams') t where t->>'userId'=${userId}) order by created_at`;
    return rows.map(r => r.state);
  }
  /** Deletes only LOBBY rooms untouched for ttlDays. ttlDays <= 0 disables cleanup. */
  async purgeStale(ttlDays: number): Promise<number> {
    if (!(ttlDays > 0)) return 0;
    const rows = await this.sql`delete from public.live_room_snapshots where status='LOBBY' and updated_at < now() - make_interval(days => ${ttlDays}) returning code`;
    return rows.length;
  }
  async assertReady(): Promise<void> { await this.sql`select 1 from public.live_room_snapshots limit 1`; }
}

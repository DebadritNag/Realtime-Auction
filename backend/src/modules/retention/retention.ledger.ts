import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import type { Room, ServerEvent } from '../../domain/types.js';
import { DomainError } from '../../domain/errors.js';

export interface RetentionLedgerRow {
  roomId: string; teamId: string; playerId: string; priceUnits: number; status: 'ACTIVE' | 'FINALIZED'; finalizedAt: number | null;
}
/** Write-behind mirror of Room.retention. The room snapshot stays authoritative. */
export interface RetentionLedger {
  /** Idempotent full sync of one room's picks. */
  sync(room: Room): Promise<void>;
}
export const RETENTION_EVENT_TYPES: ReadonlySet<string> = new Set(['PLAYER_RETAINED', 'RETENTION_FINALIZED', 'RETENTION_RESET']);
export const hasRetentionEvents = (events: readonly Pick<ServerEvent, 'type'>[]): boolean => events.some(e => RETENTION_EVENT_TYPES.has(e.type));
export const ledgerRows = (room: Room): RetentionLedgerRow[] => (room.retention?.picks ?? []).map(pick => ({
  roomId: room.id, teamId: pick.teamId, playerId: pick.playerId, priceUnits: pick.priceUnits,
  status: room.retention!.phase === 'FINALIZED' ? 'FINALIZED' : 'ACTIVE', finalizedAt: room.retention!.finalizedAt ?? null }));

/** Used by tests and when no database is configured. Enforces one record per (room, player). */
export class InMemoryRetentionLedger implements RetentionLedger {
  private readonly byRoom = new Map<string, RetentionLedgerRow[]>();
  async sync(room: Room): Promise<void> {
    const rows = ledgerRows(room);
    if (new Set(rows.map(r => r.playerId)).size !== rows.length) {
      throw new DomainError('DUPLICATE_RETENTION', 'A player can be retained only once per room.', 409);
    }
    if (rows.length === 0) this.byRoom.delete(room.id); else this.byRoom.set(room.id, rows);
  }
  rows(roomId: string): RetentionLedgerRow[] { return structuredClone(this.byRoom.get(roomId) ?? []); }
}

/** Mirrors picks into public.auction_retentions. Errors are logged and never reach the room commit. */
export class PostgresRetentionLedger implements RetentionLedger {
  private warned = new Set<string>();
  private log: { warn: (obj: object, msg: string) => void } = { warn: () => undefined };
  constructor(private readonly sql: Sql) {}
  setLogger(log: { warn: (obj: object, msg: string) => void }): void { this.log = log; }
  async sync(room: Room): Promise<void> {
    try {
      const picks = room.retention?.picks ?? [];
      const status = room.retention?.phase === 'FINALIZED' ? 'FINALIZED' : 'ACTIVE';
      const finalizedAt = room.retention?.finalizedAt ? new Date(room.retention.finalizedAt) : null;
      await this.sql.begin(async tx => {
        const keep = picks.map(p => p.playerId);
        if (keep.length) await tx`delete from public.auction_retentions where room_id = ${room.id} and fc26_player_id <> all(${keep})`;
        else await tx`delete from public.auction_retentions where room_id = ${room.id}`;
        for (const pick of picks) {
          await tx`insert into public.auction_retentions (id, room_id, team_id, player_id, fc26_player_id, retention_price_units, status, finalized_at, created_at)
            select ${randomUUID()}, ${room.id}, ${pick.teamId}, fp.id, fp.fc26_player_id, ${pick.priceUnits}, ${status}, ${finalizedAt}, ${new Date(pick.at)}
            from public.football_players fp where fp.fc26_player_id = ${pick.playerId}
            on conflict (room_id, player_id) do update set team_id = excluded.team_id, status = excluded.status, finalized_at = excluded.finalized_at`;
        }
      });
    } catch (error) {
      const code = (error as { code?: string }).code ?? 'UNKNOWN';
      // Missing schema is expected until the migration is applied; report each kind once.
      if (!this.warned.has(code)) {
        this.warned.add(code);
        this.log.warn({ roomCode: room.code, errorCode: code }, 'Retention ledger sync failed; will retry on the next retention commit');
      }
    }
  }
}

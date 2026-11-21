import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import type { Room, ServerEvent } from '../../domain/types.js';
import { DomainError } from '../../domain/errors.js';
import { RETENTION_MAX_PER_TEAM } from '../../domain/retention.js';

export interface RetentionLedgerRow {
  roomId: string; teamId: string; playerId: string; priceUnits: number; status: 'CONFIRMED' | 'FINALIZED'; finalizedAt: number | null;
  acquisitionType: 'RETENTION'; retentionOrder: number | null; turnId: string | null; confirmedAt: number; confirmedBy: string;
}
export interface RetentionTurnRow {
  id: string; roomId: string; teamId: string; turnOrder: number; kind: 'RETAINED' | 'SKIPPED'; eventId: string; retainedCount: number;
  spentUnits: number; remainingUnits: number; confirmedAt: number; confirmedBy: string;
}
/** Write-behind mirror of Room.retention (confirmed picks and completed turns only; drafts are never stored). */
export interface RetentionLedger {
  /** Idempotent full sync of one room's picks and turns. */
  sync(room: Room): Promise<void>;
}
export const RETENTION_EVENT_TYPES: ReadonlySet<string> = new Set(['RETENTION_TEAM_CONFIRMED', 'RETENTION_ALL_COMPLETED', 'RETENTION_FINALIZED', 'RETENTION_RESET']);
export const hasRetentionEvents = (events: readonly Pick<ServerEvent, 'type'>[]): boolean => events.some(e => RETENTION_EVENT_TYPES.has(e.type));
export const ledgerRows = (room: Room): RetentionLedgerRow[] => (room.retention?.picks ?? []).map(pick => ({
  roomId: room.id, teamId: pick.teamId, playerId: pick.playerId, priceUnits: pick.priceUnits,
  status: room.retention!.phase === 'FINALIZED' ? 'FINALIZED' : 'CONFIRMED', finalizedAt: room.retention!.finalizedAt ?? null,
  acquisitionType: 'RETENTION', retentionOrder: pick.order ?? null, turnId: pick.turnId ?? null,
  confirmedAt: pick.confirmedAt ?? pick.at, confirmedBy: pick.confirmedBy ?? pick.userId }));
export const ledgerTurns = (room: Room): RetentionTurnRow[] => (room.retention?.turns ?? []).map(turn => ({
  id: turn.id, roomId: room.id, teamId: turn.teamId, turnOrder: turn.order, kind: turn.kind, eventId: turn.id, retainedCount: turn.playerIds.length,
  spentUnits: turn.spentUnits, remainingUnits: turn.remainingUnits, confirmedAt: turn.at, confirmedBy: turn.confirmedBy }));

/** Used by tests and when no database is configured. Mirrors the database unique rules. */
export class InMemoryRetentionLedger implements RetentionLedger {
  private readonly picks = new Map<string, RetentionLedgerRow[]>();
  private readonly turns = new Map<string, RetentionTurnRow[]>();
  async sync(room: Room): Promise<void> {
    const rows = ledgerRows(room);
    const turns = ledgerTurns(room);
    const distinct = (values: unknown[]) => new Set(values).size === values.length;
    if (!distinct(rows.map(r => r.playerId))) throw new DomainError('DUPLICATE_RETENTION', 'A player can be retained only once per room.', 409);
    if (!distinct(rows.map(r => r.teamId + ':' + r.playerId))) throw new DomainError('DUPLICATE_RETENTION', 'A team cannot retain the same player twice.', 409);
    for (const teamId of new Set(rows.map(r => r.teamId))) {
      if (rows.filter(r => r.teamId === teamId).length > RETENTION_MAX_PER_TEAM) throw new DomainError('RETENTION_LIMIT_REACHED', 'A team can retain at most 3 players.', 409);
    }
    if (!distinct(turns.map(t => t.teamId)) || !distinct(turns.map(t => t.turnOrder)) || !distinct(turns.map(t => t.eventId))) {
      throw new DomainError('DUPLICATE_RETENTION_TURN', 'A retention turn cannot be confirmed twice.', 409);
    }
    if (rows.length === 0) this.picks.delete(room.id); else this.picks.set(room.id, rows);
    if (turns.length === 0) this.turns.delete(room.id); else this.turns.set(room.id, turns);
  }
  rows(roomId: string): RetentionLedgerRow[] { return structuredClone(this.picks.get(roomId) ?? []); }
  turnRows(roomId: string): RetentionTurnRow[] { return structuredClone(this.turns.get(roomId) ?? []); }
}

/** Mirrors picks and turns into public.auction_retentions / auction_retention_turns. Errors are logged and never reach the room commit. */
export class PostgresRetentionLedger implements RetentionLedger {
  private warned = new Set<string>();
  private log: { warn: (obj: object, msg: string) => void } = { warn: () => undefined };
  constructor(private readonly sql: Sql) {}
  setLogger(log: { warn: (obj: object, msg: string) => void }): void { this.log = log; }
  async sync(room: Room): Promise<void> {
    try {
      const picks = ledgerRows(room);
      const turns = ledgerTurns(room);
      await this.sql.begin(async tx => {
        const keep = picks.map(p => p.playerId);
        if (keep.length) await tx`delete from public.auction_retentions where room_id = ${room.id} and fc26_player_id <> all(${keep})`;
        else await tx`delete from public.auction_retentions where room_id = ${room.id}`;
        const keepTurns = turns.map(t => t.eventId);
        if (keepTurns.length) await tx`delete from public.auction_retention_turns where room_id = ${room.id} and event_id <> all(${keepTurns}::uuid[])`;
        else await tx`delete from public.auction_retention_turns where room_id = ${room.id}`;
        for (const turn of turns) {
          await tx`insert into public.auction_retention_turns (id, room_id, team_id, turn_order, kind, event_id, retained_count, spent_units, remaining_units, confirmed_at, confirmed_by)
            values (${turn.id}, ${room.id}, ${turn.teamId}, ${turn.turnOrder}, ${turn.kind}, ${turn.eventId}, ${turn.retainedCount}, ${turn.spentUnits}, ${turn.remainingUnits},
              ${new Date(turn.confirmedAt)}, ${turn.confirmedBy})
            on conflict (id) do nothing`;
        }
        for (const pick of picks) {
          await tx`insert into public.auction_retentions (id, room_id, team_id, player_id, fc26_player_id, retention_price_units, status, finalized_at, created_at,
              acquisition_type, retention_order, turn_id, confirmed_at, confirmed_by)
            select ${randomUUID()}, ${room.id}, ${pick.teamId}, fp.id, fp.fc26_player_id, ${pick.priceUnits}, ${pick.status}, ${pick.finalizedAt ? new Date(pick.finalizedAt) : null},
              ${new Date(pick.confirmedAt)}, ${pick.acquisitionType}, ${pick.retentionOrder}, ${pick.turnId}, ${new Date(pick.confirmedAt)}, ${pick.confirmedBy}
            from public.football_players fp where fp.fc26_player_id = ${pick.playerId}
            on conflict (room_id, player_id) do update set team_id = excluded.team_id, status = excluded.status, finalized_at = excluded.finalized_at,
              retention_order = excluded.retention_order, turn_id = excluded.turn_id, confirmed_at = excluded.confirmed_at, confirmed_by = excluded.confirmed_by`;
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

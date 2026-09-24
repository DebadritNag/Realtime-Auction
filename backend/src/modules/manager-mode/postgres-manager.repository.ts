/**
 * postgres-manager.repository.ts
 *
 * Production Postgres-backed implementation of ManagerTournamentRepository.
 *
 * Storage strategy:
 *   The Tournament domain object is a self-contained document (teams, players,
 *   fixtures, trades, notifications, audit, receipts — all nested).  We store
 *   the whole document as a JSONB state blob in manager_tournaments.state, plus
 *   keep the indexed scalar columns (id, source_auction_id, host_user_id,
 *   status) for efficient listing queries.
 *
 *   This mirrors the pattern used by PostgresRoomRepository for auction rooms
 *   (auction_runtime_snapshots.state) and avoids having to keep 13 normalised
 *   Manager Mode tables fully denormalised from a complex nested domain model.
 *
 *   For a future version that needs cross-tournament analytics, the Kiro
 *   normalised tables (manager_tournament_teams, manager_tournament_players,
 *   etc.) can be used for read projections while this blob remains the write
 *   store.
 *
 * Concurrency:
 *   Every write uses a SELECT … FOR UPDATE row-level lock inside a transaction
 *   so concurrent mutations on the same tournament are serialised at the DB.
 */

import type { Sql } from 'postgres';
import { DomainError, requireThat } from '../../domain/errors.js';
import type { ManagerTournamentRepository, ManagerIdentityRepository } from './manager.repository.js';
import type { Tournament } from './manager.types.js';
import { SerialQueue } from '../../utils/serial-queue.js';

// ── Postgres row shape ───────────────────────────────────────────────────────
interface TournamentRow {
  id: string;
  source_auction_id: string;
  host_user_id: string;
  status: string;
  state: Tournament | null;
}

function rowToTournament(row: TournamentRow): Tournament {
  if (!row.state) throw new DomainError('MANAGER_STATE_CORRUPT', 'Tournament state blob is missing.', 500);
  return row.state;
}

// ── Repository ────────────────────────────────────────────────────────────────
export class PostgresManagerRepository implements ManagerTournamentRepository {
  /** In-process serial queue: prevents two simultaneous mutate() calls for the
   * same tournament inside the same process.  The row-level lock handles
   * cross-process safety. */
  private readonly lock = new SerialQueue();

  constructor(private readonly sql: Sql) {}

  // ── read ──────────────────────────────────────────────────────────────────

  async find(id: string): Promise<Tournament | null> {
    const rows = await this.sql<TournamentRow[]>`
      SELECT id, source_auction_id, host_user_id, status, state
      FROM   public.manager_tournaments
      WHERE  id = ${id}
    `;
    if (!rows.length) return null;
    return rowToTournament(rows[0]!);
  }

  async findByAuction(auctionId: string): Promise<Tournament | null> {
    const rows = await this.sql<TournamentRow[]>`
      SELECT id, source_auction_id, host_user_id, status, state
      FROM   public.manager_tournaments
      WHERE  source_auction_id = ${auctionId}
    `;
    if (!rows.length) return null;
    return rowToTournament(rows[0]!);
  }

  async listForUser(userId: string): Promise<Tournament[]> {
    // Find tournaments where the user is a member (any team.managerUserId matches)
    const rows = await this.sql<TournamentRow[]>`
      SELECT id, source_auction_id, host_user_id, status, state
      FROM   public.manager_tournaments
      WHERE  state IS NOT NULL
        AND  EXISTS (
          SELECT 1
          FROM   jsonb_array_elements(state->'teams') AS t
          WHERE  t->>'managerUserId' = ${userId}
        )
      ORDER BY (state->>'updatedAt')::bigint DESC
    `;
    return rows.map(rowToTournament);
  }

  // ── write ─────────────────────────────────────────────────────────────────

  async createUnique(tournament: Tournament): Promise<{ tournament: Tournament; created: boolean }> {
    return this.lock.runExclusive('create:' + tournament.sourceAuctionId, async () => {
      return this.sql.begin(async tx => {
        // Check for existing tournament with the same source auction (UNIQUE constraint)
        const existing = await tx<TournamentRow[]>`
          SELECT id, source_auction_id, host_user_id, status, state
          FROM   public.manager_tournaments
          WHERE  source_auction_id = ${tournament.sourceAuctionId}
          FOR UPDATE
        `;
        if (existing.length) {
          return { tournament: rowToTournament(existing[0]!), created: false };
        }

        // Insert new row — scalar columns + full state blob
        await tx`
          INSERT INTO public.manager_tournaments (
            id, source_auction_id, host_user_id, name, status,
            fixture_format, starting_transfer_budget_units, state
          ) VALUES (
            ${tournament.id},
            ${tournament.sourceAuctionId},
            ${tournament.hostUserId},
            ${tournament.name},
            ${mapStatus(tournament.status)},
            ${tournament.format},
            ${tournament.startingBudgetUnits},
            ${tx.json(JSON.parse(JSON.stringify(tournament)) as import('postgres').JSONValue)}
          )
        `;

        return { tournament, created: true };
      });
    });
  }

  async mutate(
    id: string,
    change: (draft: Tournament) => Promise<void> | void
  ): Promise<Tournament> {
    return this.lock.runExclusive(id, async () => {
      return this.sql.begin(async tx => {
        // Lock the row for the duration of this transaction
        const rows = await tx<TournamentRow[]>`
          SELECT id, source_auction_id, host_user_id, status, state
          FROM   public.manager_tournaments
          WHERE  id = ${id}
          FOR UPDATE
        `;
        requireThat(rows.length, 'TOURNAMENT_NOT_FOUND', 'Tournament not found.', 404);

        const draft = rowToTournament(rows[0]!);
        await change(draft);

        // Persist updated state + sync scalar status column
        await tx`
          UPDATE public.manager_tournaments
          SET    state    = ${tx.json(JSON.parse(JSON.stringify(draft)) as import('postgres').JSONValue)},
                 status   = ${mapStatus(draft.status)},
                 name     = ${draft.name},
                 updated_at = NOW()
          WHERE  id = ${id}
        `;

        return draft;
      });
    });
  }
}

// ── Identity repository (reads usernames from profiles) ──────────────────────
export class PostgresManagerIdentityRepository implements ManagerIdentityRepository {
  constructor(private readonly sql: Sql) {}

  async findUsernames(userIds: string[]): Promise<Record<string, string>> {
    if (!userIds.length) return {};
    const rows = await this.sql<{ id: string; username: string }[]>`
      SELECT id, username::text
      FROM   public.profiles
      WHERE  id = ANY(${userIds}::uuid[])
    `;
    return Object.fromEntries(rows.map(r => [r.id, r.username]));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Map the domain TournamentStatus to the DB CHECK constraint values
function mapStatus(status: string): string {
  // Domain uses 'INVITING'; DB CHECK accepts the same set + 'SETUP'
  // DB: SETUP | INVITING | ACTIVE | COMPLETED | ARCHIVED
  if (['SETUP', 'INVITING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'].includes(status)) return status;
  return 'INVITING'; // safe fallback
}

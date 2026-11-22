import { createHash } from 'node:crypto';
import { requireThat } from '../../../domain/errors.js';
import { toCr, toUnits } from '../../../domain/money.js';
import type { AuctionPlayer, PlayerStatus, PoolImportBatch, PoolImportRowResult, Room } from '../../../domain/types.js';
import type { Player } from '../../../domain/types.js';
import type { RoomManager } from '../../rooms/room.manager.js';
import { requireHost, requireMember } from '../../rooms/room.service.js';
import { categoryState, type CategoryState } from './pool-additions.js';
import { csvCandidates, playerCandidates, sanitizeFileName, type PricingContext } from './pool-import.parser.js';
import { POOL_IMPORT_LIMITS, type ParsedPoolInput, type PoolCandidate, type PoolImportInput, type PoolImportReport, type PoolReportRow } from './pool-import.types.js';

interface Classified { candidate: PoolCandidate; status: 'ELIGIBLE' | 'SKIPPED' | 'REJECTED'; code: string; reason: string }
const unique = <T,>(items: T[] | undefined): T[] | undefined => items ? [...new Set(items)] : undefined;

/** Additive import of players into a LIVE auction. Never touches the live lot, existing players, the existing queue or timers. */
export class PoolImportService {
  constructor(private readonly manager: RoomManager) {}

  private context(room: Room): PricingContext {
    return { roomSource: room.settings.playerPoolSource, topRatingThreshold: this.manager.fc26?.topRatingThreshold ?? 90,
      minimumBasePriceUnits: toUnits(room.settings.minimumBasePriceCr) };
  }
  private assertImportable(room: Room, userId: string): void {
    requireMember(room, userId);
    requireHost(room, userId);
    requireThat(room.status !== 'LOBBY', 'INVALID_STATE', 'The auction has not started. Configure the player pool in the room settings instead.', 409);
    requireThat(room.status === 'RUNNING' || room.status === 'PAUSED', 'INVALID_STATE', 'Players can only be added to a running or paused auction.', 409);
  }
  /** Async resolution and CSV parsing happen before the room lock is taken. Nothing parsed here is trusted for eligibility. */
  private async parse(room: Room, input: PoolImportInput): Promise<ParsedPoolInput> {
    const ctx = this.context(room);
    const contentHash = createHash('sha256').update(JSON.stringify([input.source, input.csv ?? null, unique(input.playerIds) ?? null,
      unique(input.potIds) ?? null, input.search ?? null])).digest('hex');
    if (input.source === 'CSV') {
      return { sourceKind: 'CSV', sourceFile: sanitizeFileName(input.fileName), candidates: csvCandidates(input.csv, ctx), contentHash };
    }
    const ids = unique(input.playerIds); const pots = unique(input.potIds);
    const tokens = (input.search ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (p: Player) => (!ids || ids.includes(p.id)) && (!pots || pots.includes(p.potId))
      && tokens.every(t => [p.name, p.fullName, p.club, p.nationality, p.id].filter(Boolean).join(' ').toLowerCase().includes(t));
    if (input.source === 'FC26_DATABASE') {
      requireThat(room.settings.playerPoolSource === 'FC26', 'SOURCE_MISMATCH', 'This room does not use the FC26 player source.', 409);
      requireThat(this.manager.fc26, 'FC26_UNAVAILABLE', 'FC26 database is not configured on this server.', 503);
      const found = (await this.manager.fc26.list()).filter(matches);
      return { sourceKind: 'FC26_DATABASE', sourceFile: 'FC26 database', candidates: playerCandidates(found, ctx), contentHash };
    }
    requireThat(room.settings.playerPoolSource === 'DEFAULT', 'SOURCE_MISMATCH', 'This room does not use the default player pool.', 409);
    const found = (await this.manager.players.listPlayerPool({ ...(ids ? { playerIds: ids } : {}), ...(pots ? { potIds: pots } : {}) })).filter(matches);
    return { sourceKind: 'DEFAULT_POOL', sourceFile: 'Default player pool', candidates: playerCandidates(found, ctx), contentHash };
  }

  /** Eligibility is always evaluated against the room it is given: the latest committed state inside the lock. */
  private classify(room: Room, candidates: PoolCandidate[]): Classified[] {
    const existing = new Map<string, AuctionPlayer>(room.players.map(p => [p.id, p]));
    const retained = new Set([...(room.retention?.picks ?? []).map(p => p.playerId), ...(room.retention?.drafts ?? []).map(d => d.playerId)]);
    const sold = new Set(room.purchases.map(p => p.playerId));
    const seen = new Set<string>();
    return candidates.map((candidate): Classified => {
      const out = (status: Classified['status'], code: string, reason: string): Classified => ({ candidate, status, code, reason });
      if (candidate.error || !candidate.player) return out('REJECTED', candidate.error?.code ?? 'INVALID', candidate.error?.reason ?? 'Invalid record.');
      const id = candidate.player.id;
      if (seen.has(id)) return out('SKIPPED', 'DUPLICATE_IN_FILE', 'Appears more than once in the import; only the first record is used.');
      seen.add(id);
      if (retained.has(id)) return out('SKIPPED', 'RETAINED', 'Retained by a team.');
      const current = existing.get(id);
      if (room.active?.playerId === id || current?.status === 'ACTIVE') return out('SKIPPED', 'CURRENTLY_LIVE', 'Currently being auctioned.');
      if (current?.status === 'SOLD' || sold.has(id)) return out('SKIPPED', 'SOLD', 'Already sold.');
      if (current?.status === 'UNSOLD') return out('SKIPPED', 'ALREADY_UNSOLD', 'Already marked unsold; use recall instead.');
      if (current) return out('SKIPPED', 'ALREADY_IN_POOL', 'Already in the auction pool.');
      return out('ELIGIBLE', 'ELIGIBLE', 'Eligible for import.');
    });
  }
  private rowOf(room: Room, c: Classified, states: Map<string, CategoryState>): PoolReportRow {
    const p = c.candidate.player;
    const base: PoolReportRow = { row: c.candidate.row, playerId: c.candidate.playerId, name: c.candidate.name, status: c.status, code: c.code, reason: c.reason };
    if (!p) return base;
    if (!states.has(p.potId)) states.set(p.potId, categoryState(room, p.potId));
    return { ...base, positions: p.positions ?? [p.subPosition ?? p.position], ovr: p.ovr, potId: p.potId, categoryState: states.get(p.potId)!,
      basePriceCr: toCr(p.basePriceUnits), underdog: p.draftPool === 'UNDERDOG' };
  }
  private totals(rows: PoolReportRow[], added: number): PoolImportReport['totals'] {
    const byReason: Record<string, number> = {};
    for (const r of rows) if (r.status !== 'ELIGIBLE') byReason[r.code] = (byReason[r.code] ?? 0) + 1;
    return { totalRecords: rows.length, eligible: rows.filter(r => r.status === 'ELIGIBLE').length, added,
      skipped: rows.filter(r => r.status === 'SKIPPED').length, rejected: rows.filter(r => r.status === 'REJECTED').length, byReason };
  }

  async preview(code: string, userId: string, input: PoolImportInput): Promise<PoolImportReport> {
    const room = await this.manager.loadRoom(code);
    this.assertImportable(room, userId);
    const parsed = await this.parse(room, input);
    const states = new Map<string, CategoryState>();
    const rows = this.classify(room, parsed.candidates).map(c => this.rowOf(room, c, states));
    return { mode: 'PREVIEW', sequence: room.sequence, totals: this.totals(rows, 0), rows };
  }

  async commit(code: string, userId: string, input: PoolImportInput): Promise<PoolImportReport> {
    requireThat(input.batchId, 'BATCH_ID_REQUIRED', 'batchId is required to commit an import.');
    const batchId = input.batchId;
    const peek = await this.manager.loadRoom(code);
    this.assertImportable(peek, userId);
    const parsed = await this.parse(peek, input);
    return this.manager.mutate(code, (room, events): PoolImportReport => {
      this.assertImportable(room, userId);
      const prior = (room.poolImports ?? []).find(b => b.batchId === batchId);
      if (prior) {
        requireThat(prior.contentHash === parsed.contentHash, 'IDEMPOTENCY_CONFLICT', 'batchId was already used for a different import.', 409);
        return this.replay(room, prior);
      }
      const now = this.manager.clock.now();
      const classified = this.classify(room, parsed.candidates);
      // Category state is computed once from the room as it is before this import adds anything.
      const states = new Map<string, CategoryState>();
      const rows = classified.map(c => this.rowOf(room, c, states));
      const eligible = classified.filter(c => c.status === 'ELIGIBLE');
      if (eligible.length === 0) return { mode: 'COMMIT', batchId, sequence: room.sequence, totals: this.totals(rows, 0), rows };
      const addedPlayers = eligible.map(c => {
        const p = c.candidate.player!;
        const release: 'FOLLOW' | 'HELD' = states.get(p.potId) === 'ACTIVE' ? 'FOLLOW' : 'HELD';
        const player: AuctionPlayer = { ...p, status: 'WAITING' as PlayerStatus, round: 0,
          poolMeta: { poolStatus: 'PENDING', importBatchId: batchId, importedAt: now, importedBy: userId, sourceFile: parsed.sourceFile,
            sourceCategory: p.sourceCategory ?? p.potId, release } };
        return { player, row: c.candidate.row };
      });
      room.players.push(...addedPlayers.map(a => a.player));
      room.addedQueue = [...(room.addedQueue ?? []), ...addedPlayers.map(a => a.player.id)];
      const categoryCounts: Record<string, number> = {};
      for (const { player } of addedPlayers) categoryCounts[player.potId] = (categoryCounts[player.potId] ?? 0) + 1;
      const cap = (status: 'SKIPPED' | 'REJECTED'): PoolImportRowResult[] => classified.filter(c => c.status === status).slice(0, POOL_IMPORT_LIMITS.maxStoredResults)
        .map(c => ({ row: c.candidate.row, playerId: c.candidate.playerId, name: c.candidate.name, code: c.code, reason: c.reason }));
      const batch: PoolImportBatch = { batchId, contentHash: parsed.contentHash, at: now, by: userId, sourceKind: parsed.sourceKind, sourceFile: parsed.sourceFile,
        totalRecords: rows.length, addedPlayerIds: addedPlayers.map(a => a.player.id), addedRows: addedPlayers.map(a => ({ row: a.row, playerId: a.player.id })), categoryCounts,
        heldCount: addedPlayers.filter(a => a.player.poolMeta!.release === 'HELD').length, skipped: cap('SKIPPED'), rejected: cap('REJECTED') };
      room.poolImports = [...(room.poolImports ?? []), batch].slice(-POOL_IMPORT_LIMITS.maxBatches);
      events.push({ type: 'PLAYER_POOL_UPDATED', payload: { auctionId: room.id, roomCode: room.code, batchId, addedCount: addedPlayers.length,
        addedPlayerIds: batch.addedPlayerIds, addedPlayers: addedPlayers.map(a => ({ playerId: a.player.id, category: a.player.potId, releaseState: a.player.poolMeta!.release })),
        categoryCounts, heldCount: batch.heldCount, importedAt: now } });
      return { mode: 'COMMIT', batchId, sequence: room.sequence + 1, totals: this.totals(rows, addedPlayers.length), rows };
    });
  }

  /** Report for a batch that was already committed. Row numbers of added players are kept in the batch. */
  private replay(room: Room, batch: PoolImportBatch): PoolImportReport {
    const addedRows = batch.addedRows;
    const rows: PoolReportRow[] = [
      ...addedRows.map(a => {
        const p = room.players.find(x => x.id === a.playerId);
        return { row: a.row, playerId: a.playerId, name: p?.name ?? '', status: 'ELIGIBLE' as const, code: 'ELIGIBLE', reason: 'Added.',
          ...(p ? { potId: p.potId, ovr: p.ovr, basePriceCr: toCr(p.basePriceUnits), underdog: p.draftPool === 'UNDERDOG' } : {}) };
      }),
      ...batch.skipped.map(r => ({ ...r, status: 'SKIPPED' as const })), ...batch.rejected.map(r => ({ ...r, status: 'REJECTED' as const })),
    ].sort((a, b) => a.row - b.row);
    const byReason: Record<string, number> = {};
    for (const r of [...batch.skipped, ...batch.rejected]) byReason[r.code] = (byReason[r.code] ?? 0) + 1;
    return { mode: 'COMMIT', batchId: batch.batchId, duplicate: true, sequence: room.sequence, rows,
      totals: { totalRecords: batch.totalRecords, eligible: batch.addedPlayerIds.length, added: batch.addedPlayerIds.length,
        skipped: batch.skipped.length, rejected: batch.rejected.length, byReason } };
  }
}

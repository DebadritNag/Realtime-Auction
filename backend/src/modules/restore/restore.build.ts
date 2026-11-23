import { randomUUID } from 'node:crypto';
import type { AuctionPlayer, Purchase, Room, Team } from '../../domain/types.js';
import { requireThat } from '../../domain/errors.js';
import { toUnits } from '../../domain/money.js';
import { fc26BasePriceUnits } from '../../domain/pricing.js';
import { RETENTION_PRICE_UNITS } from '../../domain/retention.js';
import { parseSettings, type RoomSettings } from '../../schemas/settings.js';
import { MAX_SQUAD_SIZE } from './restore.types.js';
import type { RestoreSnapshot } from './restore.schema.js';
import { snapshotHash, type ValidationResult } from './restore.validate.js';
import { bindTeam, unclaimedUserId } from './restore.claims.js';
export { isUnclaimed, unclaimedUserId } from './restore.claims.js';
export interface BuildRestoredRoomInput {
  ctx: { id: string; code: string; now: number };
  host: { userId: string; username?: string };
  auctionName: string; hostTeamName?: string; snapshot: RestoreSnapshot; validation: ValidationResult;
  source: 'TEMPLATE' | 'CUSTOM'; topRatingThreshold: number; settings?: Partial<RoomSettings>;
  /** Host reservations, already checked against the profile directory; label is the user's display name. */
  bindings?: { teamName: string; userId: string; label: string }[];
}
/**
 * Builds a LOBBY room from a validated snapshot. Purses are the authoritative opening balances (never derived from prices);
 * every restored player is SOLD, owned by exactly one team, with a zero-price purchase so the budget ledger stays consistent.
 */
export function buildRestoredRoom(input: BuildRestoredRoomInput): Room {
  const { ctx, host, snapshot, validation } = input;
  requireThat(validation.preview.canConfirm, 'RESTORE_VALIDATION_FAILED', 'The snapshot has unresolved critical issues.', 422);
  const hostName = (input.hostTeamName ?? snapshot.hostTeam ?? '').trim().toLowerCase();
  const hostIndex = validation.teams.findIndex(t => t.name.trim().toLowerCase() === hostName);
  requireThat(hostIndex >= 0, 'HOST_TEAM_NOT_FOUND', 'Choose which restored team you manage.', 422);
  const maxPurse = Math.max(...validation.teams.map(t => t.purseCr));
  const settings = parseSettings({ ...(input.settings ?? {}), numberOfTeams: validation.teams.length,
    minimumParticipants: Math.min(input.settings?.minimumParticipants ?? validation.teams.length, validation.teams.length),
    playerPoolSource: 'FC26', maxSquadSize: MAX_SQUAD_SIZE, minSquadSize: 11, retention: { enabled: false },
    startingBudgetCr: Math.max(11, maxPurse), playerPoolConfig: {} });
  const teams: Team[] = [];
  const players: AuctionPlayer[] = [];
  const purchases: Purchase[] = [];
  const restoreTeams: NonNullable<Room['restore']>['teams'] = [];
  const minBase = toUnits(settings.minimumBasePriceCr);
  validation.teams.forEach((vt, i) => {
    const id = randomUUID();
    const isHost = i === hostIndex;
    const team: Team = { id, userId: isHost ? host.userId : unclaimedUserId(id), ...(isHost && host.username ? { managerUsername: host.username } : {}),
      name: snapshot.teams[i]!.name, startingBudgetUnits: toUnits(vt.purseCr), spentUnits: 0, playerIds: [] };
    let retained = 0;
    for (const { input: entry, match } of vt.players) {
      const player = match.player!;
      const retention = entry.acquisition === 'RETENTION';
      if (retention) retained++;
      const basePriceUnits = match.source === 'FC26'
        ? fc26BasePriceUnits({ overall: player.ovr, draftPool: player.draftPool ?? 'REGULAR' }, input.topRatingThreshold)
        : Math.max(player.basePriceUnits, minBase);
      players.push({ ...structuredClone(player), basePriceUnits, status: 'SOLD', round: 0, restoredFromSnapshot: true, restoreSource: match.source! });
      team.playerIds.push(player.id);
      purchases.push({ id: randomUUID(), playerId: player.id, teamId: id, priceUnits: 0, bidCount: 0, at: ctx.now, durationMs: 0,
        acquisitionType: entry.acquisition, isRetained: retention, restoredFromSnapshot: true, recordedPriceUnits: retention ? RETENTION_PRICE_UNITS : null });
    }
    teams.push(team);
    restoreTeams.push({ teamId: id, name: team.name, purseUnits: team.startingBudgetUnits, squadSize: team.playerIds.length,
      retainedCount: retained, auctionCount: team.playerIds.length - retained });
  });
  const warnings = validation.preview.issues.filter(i => i.severity === 'WARNING').map(i => i.message);
  const room: Room = { id: ctx.id, code: ctx.code, hostUserId: host.userId, auctionName: input.auctionName, status: 'LOBBY', createdAt: ctx.now, lastActivityAt: ctx.now,
    settings, teams, players, playerQueue: [], purchases, bids: [], active: null, sequence: 1, nextPlayerAt: null, receipts: {},
    restore: { version: 1, source: input.source, snapshotName: snapshot.name, snapshotHash: snapshotHash(snapshot), restoredAt: ctx.now, warnings, teams: restoreTeams } };
  const bound = new Set<string>();
  for (const binding of input.bindings ?? []) {
    const key = binding.teamName.trim().toLowerCase();
    const team = teams.find(t => t.name.trim().toLowerCase() === key);
    requireThat(team, 'BINDING_TEAM_NOT_FOUND', `No restored team is named "${binding.teamName}".`, 422);
    requireThat(!bound.has(team.id), 'DUPLICATE_BINDING', `"${binding.teamName}" is bound more than once.`, 422);
    bound.add(team.id);
    bindTeam(room, team, binding.userId, binding.label);
  }
  return room;
}

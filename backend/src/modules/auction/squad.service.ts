import type { Room } from '../../domain/types.js';
import { requireThat } from '../../domain/errors.js';
import { settingsSchema } from '../../schemas/settings.js';
import { toUnits } from '../../domain/money.js';
import { RETENTION_MAX_PER_TEAM, RETENTION_PRICE_UNITS } from '../../domain/retention.js';
export function assertRoom(room: Room): void {
  const invariant = (condition: unknown, message: string) => requireThat(condition, 'INVALID_STATE', message, 409);
  settingsSchema.parse(room.settings);
  invariant(Number.isSafeInteger(room.sequence) && room.sequence >= 1, 'Invalid room sequence.');
  invariant(new Set(room.players.map(p => p.id)).size === room.players.length, 'Duplicate players.');
  invariant(new Set(room.teams.map(t => t.id)).size === room.teams.length, 'Duplicate teams.');
  invariant(new Set(room.teams.map(t => t.userId)).size === room.teams.length, 'Duplicate memberships.');
  invariant(room.teams.length <= room.settings.numberOfTeams, 'Too many teams.');
  const active = room.players.filter(p => p.status === 'ACTIVE');
  invariant(active.length === (room.active ? 1 : 0), 'Only one player may be active.');
  if (room.active) {
    invariant(['RUNNING', 'PAUSED'].includes(room.status), 'Active player outside live auction.');
    invariant(active[0]?.id === room.active.playerId, 'Active player mismatch.');
    invariant(Number.isSafeInteger(room.active.currentBidUnits) && room.active.currentBidUnits > 0, 'Invalid live bid.');
    const votes = room.active.skipVoterUserIds ?? [];
    invariant(new Set(votes).size === votes.length && votes.every(id => room.teams.some(t => t.userId === id)), 'Invalid skip voters.');
    invariant(!room.active.highestBidderTeamId || votes.length === 0, 'Skip votes cannot discard accepted bids.');
    invariant(Number.isFinite(room.active.endsAt), 'Invalid timer.');
    invariant(!room.active.highestBidderTeamId || room.teams.some(t => t.id === room.active!.highestBidderTeamId), 'Missing highest bidder.');
  }
  invariant(new Set(room.playerQueue).size === room.playerQueue.length, 'Duplicate queue entry.');
  invariant(room.playerQueue.every(id => room.players.some(p => p.id === id && ['WAITING', 'UNSOLD'].includes(p.status))), 'Invalid queue entry.');
  const added = room.addedQueue ?? [];
  invariant(new Set(added).size === added.length, 'Duplicate added-queue entry.');
  invariant(added.every(id => room.players.some(p => p.id === id && p.status === 'WAITING' && p.poolMeta) && !room.playerQueue.includes(id)), 'Invalid added-queue entry.');
  const batches = room.poolImports ?? [];
  invariant(new Set(batches.map(b => b.batchId)).size === batches.length, 'Duplicate pool import batch.');
  const owned = room.teams.flatMap(t => t.playerIds);
  invariant(new Set(owned).size === owned.length, 'Player owned more than once.');
  invariant(new Set(room.purchases.map(p => p.playerId)).size === room.purchases.length, 'Player sold more than once.');
  for (const team of room.teams) {
    invariant(Number.isSafeInteger(team.spentUnits) && team.spentUnits >= 0 && team.spentUnits <= team.startingBudgetUnits, 'Invalid budget.');
    invariant(team.startingBudgetUnits === toUnits(room.settings.startingBudgetCr), 'Starting budget mismatch.');
    invariant(team.playerIds.length <= room.settings.maxSquadSize, 'Squad exceeds maximum.');
    const purchases = room.purchases.filter(p => p.teamId === team.id);
    invariant(purchases.reduce((sum, p) => sum + p.priceUnits, 0) === team.spentUnits, 'Budget ledger mismatch.');
    invariant(purchases.length === team.playerIds.length && purchases.every(p => team.playerIds.includes(p.playerId)), 'Squad ledger mismatch.');
  }
  if (room.retention) {
    const { picks, phase, finalizedAt } = room.retention;
    const drafts = room.retention.drafts ?? [];
    const turns = room.retention.turns ?? [];
    const order = room.retention.order;
    invariant(['NOT_STARTED', 'TEAM_SELECTING', 'ALL_TEAMS_COMPLETED', 'FINALIZED'].includes(phase), 'Invalid retention phase.');
    invariant((picks.length === 0 && drafts.length === 0 && phase === 'NOT_STARTED') || room.settings.retention.enabled, 'Retention state exists while retention is disabled.');
    invariant(phase !== 'FINALIZED' || Number.isFinite(finalizedAt), 'Retention finalized without a timestamp.');
    invariant(new Set(picks.map(p => p.id)).size === picks.length, 'Duplicate retention pick.');
    invariant(new Set(picks.map(p => p.playerId)).size === picks.length, 'Player retained more than once.');
    for (const team of room.teams) {
      const held = picks.filter(p => p.teamId === team.id).length + drafts.filter(d => d.teamId === team.id).length;
      invariant(held <= RETENTION_MAX_PER_TEAM, 'Too many retained players.');
    }
    for (const pick of picks) {
      invariant(room.teams.some(t => t.id === pick.teamId), 'Retention pick for a missing team.');
      invariant(pick.priceUnits === RETENTION_PRICE_UNITS, 'Invalid retention price.');
    }
    invariant(new Set(drafts.map(d => d.playerId)).size === drafts.length, 'Player drafted more than once.');
    invariant(drafts.every(d => !picks.some(p => p.playerId === d.playerId)), 'Draft duplicates a confirmed pick.');
    invariant(drafts.length === 0 || (phase === 'TEAM_SELECTING' && drafts.every(d => d.teamId === room.retention!.activeTeamId)), 'Drafts only belong to the active team.');
    if (phase === 'NOT_STARTED') invariant(picks.length === 0 && turns.length === 0, 'Retention data before the phase started.');
    else if (order) {
      invariant(new Set(order).size === order.length && order.every(id => room.teams.some(t => t.id === id)), 'Invalid retention order.');
      invariant(new Set(turns.map(t => t.id)).size === turns.length, 'Duplicate retention turn.');
      invariant(turns.every((t, i) => t.teamId === order[i] && t.order === i + 1), 'Retention turns out of order.');
      invariant(picks.every(p => turns.some(t => t.id === p.turnId && t.teamId === p.teamId)), 'Retention pick without a completed turn.');
      invariant(turns.every(t => picks.filter(p => p.turnId === t.id).length === t.playerIds.length && t.spentUnits === t.playerIds.length * RETENTION_PRICE_UNITS), 'Retention turn mismatch.');
      if (phase === 'TEAM_SELECTING') invariant(room.retention.activeTeamId === order[turns.length] && turns.length < order.length, 'Invalid active retention team.');
      else invariant(turns.length === order.length && !room.retention.activeTeamId, 'Retention incomplete.');
    }
    const retentionPurchases = room.purchases.filter(p => p.acquisitionType === 'RETENTION');
    if (phase === 'FINALIZED') {
      for (const pick of picks) {
        const purchase = retentionPurchases.find(p => p.playerId === pick.playerId);
        invariant(purchase && purchase.teamId === pick.teamId && purchase.priceUnits === RETENTION_PRICE_UNITS, 'Retention purchase mismatch.');
        invariant(room.players.some(p => p.id === pick.playerId && p.status === 'SOLD'), 'Retained player is not sold.');
      }
    } else invariant(retentionPurchases.length === 0, 'Retention purchases before finalization.');
  }
  const retentionPurchases = room.purchases.filter(p => p.acquisitionType === 'RETENTION');
  invariant(retentionPurchases.every(p => room.retention?.picks.some(k => k.playerId === p.playerId && k.teamId === p.teamId)), 'Retention purchase without pick.');
  for (const player of room.players) {
    invariant(Number.isSafeInteger(player.basePriceUnits) && player.basePriceUnits >= toUnits(room.settings.minimumBasePriceCr), 'Invalid player base price.');
    invariant((player.status === 'SOLD') === owned.includes(player.id), 'Player sale and ownership mismatch.');
  }
}

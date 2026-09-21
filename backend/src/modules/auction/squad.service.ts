import type { Room } from '../../domain/types.js';
import { requireThat } from '../../domain/errors.js';
import { settingsSchema } from '../../schemas/settings.js';
import { toUnits } from '../../domain/money.js';
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
    invariant(new Set(votes).size === votes.length && votes.every(id => id !== room.hostUserId && room.teams.some(t => t.userId === id)), 'Invalid skip voters.');
    invariant(!room.active.highestBidderTeamId || votes.length === 0, 'Skip votes cannot discard accepted bids.');
    invariant(Number.isFinite(room.active.endsAt), 'Invalid timer.');
    invariant(!room.active.highestBidderTeamId || room.teams.some(t => t.id === room.active!.highestBidderTeamId), 'Missing highest bidder.');
  }
  invariant(new Set(room.playerQueue).size === room.playerQueue.length, 'Duplicate queue entry.');
  invariant(room.playerQueue.every(id => room.players.some(p => p.id === id && ['WAITING', 'UNSOLD'].includes(p.status))), 'Invalid queue entry.');
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
  for (const player of room.players) {
    invariant(Number.isSafeInteger(player.basePriceUnits) && player.basePriceUnits >= toUnits(room.settings.minimumBasePriceCr), 'Invalid player base price.');
    invariant((player.status === 'SOLD') === owned.includes(player.id), 'Player sale and ownership mismatch.');
  }
}

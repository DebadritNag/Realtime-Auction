import type { Player, RoomRetention, Team } from '../../domain/types.js';
import { toCr } from '../../domain/money.js';
import { remainingBudget, getMaximumPermittedBid } from '../auction/budget.service.js';
import type { RoomSettings } from '../../schemas/settings.js';
export function publicPlayer(player: Player) {
  const { basePriceUnits, ...rest } = player;
  return { ...rest, basePriceCr: toCr(basePriceUnits) };
}
export function publicTeam(team: Team, settings: RoomSettings, retention?: RoomRetention) {
  const picks = (retention?.picks ?? []).filter(p => p.teamId === team.id);
  const retentionSpentUnits = picks.reduce((sum, p) => sum + p.priceUnits, 0);
  return { id: team.id, userId: team.userId, name: team.name, logoUrl: team.logoUrl, logoEmoji: team.logoEmoji,
    startingBudgetCr: toCr(team.startingBudgetUnits), spentCr: toCr(team.spentUnits),
    remainingBudgetCr: toCr(remainingBudget(team)), playerIds: team.playerIds,
    playersOwned: team.playerIds.length, maximumPermittedBidCr: toCr(getMaximumPermittedBid(team, settings)),
    minimumSquadMet: team.playerIds.length >= settings.minSquadSize,
    retainedCount: picks.length, retentionSpentCr: toCr(retentionSpentUnits), auctionPurseCr: toCr(team.startingBudgetUnits - retentionSpentUnits) };
}

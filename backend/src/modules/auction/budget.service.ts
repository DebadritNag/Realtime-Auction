import type { Team } from '../../domain/types.js';
import type { RoomSettings } from '../../schemas/settings.js';
import { toUnits } from '../../domain/money.js';
export const remainingBudget = (team: Team): number => team.startingBudgetUnits - team.spentUnits;
export const getRequiredReserve = (team: Team, settings: RoomSettings, prospectivePurchase = false): number =>
  Math.max(0, settings.minSquadSize - team.playerIds.length - (prospectivePurchase ? 1 : 0)) * toUnits(settings.minimumBasePriceCr);
export const getMaximumPermittedBid = (team: Team, settings: RoomSettings): number =>
  team.playerIds.length >= settings.maxSquadSize ? 0 : Math.max(0, remainingBudget(team) - getRequiredReserve(team, settings, true));

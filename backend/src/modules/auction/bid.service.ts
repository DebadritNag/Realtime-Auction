import type { Room, Team } from '../../domain/types.js';
import { requireThat } from '../../domain/errors.js';
import { getMinimumNextBid, toCr, toUnits } from '../../domain/money.js';
import { getMaximumPermittedBid, remainingBudget } from './budget.service.js';
export const minimumNextBid = (room: Room): number | null => room.active
  ? room.active.highestBidderTeamId ? getMinimumNextBid(room.active.currentBidUnits) : room.active.currentBidUnits : null;
export function validateBid(room: Room, team: Team, amountCr: number, now: number): number {
  requireThat(room.status !== 'PAUSED', 'AUCTION_PAUSED', 'Auction is paused.');
  requireThat(room.status === 'RUNNING', 'AUCTION_NOT_RUNNING', 'Auction is not running.');
  const active = room.active;
  requireThat(active && room.players.find(p => p.id === active.playerId)?.status === 'ACTIVE', 'NO_ACTIVE_PLAYER', 'No active player.');
  requireThat(active.biddingOpen && now < active.endsAt, 'TIMER_EXPIRED', 'Bidding has closed.');
  requireThat(active.highestBidderTeamId !== team.id, 'ALREADY_HIGHEST_BIDDER', 'You already hold the highest bid.');
  requireThat(team.playerIds.length < room.settings.maxSquadSize, 'SQUAD_FULL', 'Your squad is full.');
  const amount = toUnits(amountCr);
  const minimum = minimumNextBid(room)!;
  requireThat(amount >= minimum, 'BID_TOO_LOW', 'Bid is below the next allowed bid.', 400, { minimumNextBidCr: toCr(minimum) });
  requireThat(room.settings.allowCustomBids || amount === minimum, 'INVALID_INCREMENT', 'Custom bids are disabled.', 400, { minimumNextBidCr: toCr(minimum) });
  requireThat(amount <= remainingBudget(team), 'INSUFFICIENT_BUDGET', 'Bid exceeds remaining budget.');
  requireThat(amount <= getMaximumPermittedBid(team, room.settings), 'SQUAD_RESERVE_REQUIRED', 'Reserve funds for the remaining minimum squad.');
  return amount;
}

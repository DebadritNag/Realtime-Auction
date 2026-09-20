import type { Room, Team } from '../../domain/types.js';
import { requireThat } from '../../domain/errors.js';
import { toCr } from '../../domain/money.js';
import { getMaximumPermittedBid, remainingBudget } from '../auction/budget.service.js';
import { minimumNextBid } from '../auction/bid.service.js';
export interface Recommendation {
  recommendedMinCr: number; recommendedMaxCr: number; suggestedCeilingCr: number;
  budgetRisk: 'LOW' | 'MEDIUM' | 'HIGH'; squadNeedScore: number; scarcityScore: number;
  reasons: string[]; warnings: string[];
}
export interface AuctionRecommendationService { recommend(room: Room, team: Team): Promise<Recommendation> }
export class DeterministicRecommendationService implements AuctionRecommendationService {
  async recommend(room: Room, team: Team): Promise<Recommendation> {
    const player = room.players.find(p => p.id === room.active?.playerId);
    requireThat(player, 'NO_ACTIVE_PLAYER', 'Recommendations require an active player.', 409);
    const targets = { GK: 1, DEF: 4, MID: 3, FWD: 3 };
    const owned = room.players.filter(p => team.playerIds.includes(p.id) && p.position === player.position).length;
    const desired = Math.max(1, Math.round(targets[player.position] * room.settings.minSquadSize / 11));
    const need = Math.max(0, (desired - owned) / desired);
    const remaining = room.players.filter(p => ['WAITING', 'UNSOLD'].includes(p.status));
    const similar = remaining.filter(p => p.position === player.position && p.ovr >= player.ovr - 5).length;
    const scarcity = 1 / (1 + similar);
    const cap = getMaximumPermittedBid(team, room.settings);
    const slots = Math.max(1, room.settings.minSquadSize - team.playerIds.length);
    const averageStats = Object.values(player.stats).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(player.stats).length);
    const quality = 0.8 + player.ovr / 100 + averageStats / 500;
    const valuation = Math.floor(Math.max(player.basePriceUnits, remainingBudget(team) / slots * quality * (0.6 + need * 0.5 + scarcity * 0.3)));
    const ceiling = Math.max(0, Math.min(cap, valuation));
    const minimum = minimumNextBid(room)!;
    const warnings: string[] = [];
    if (minimum > cap) warnings.push('Next bid exceeds your budget or minimum-squad reserve.');
    if (minimum > ceiling) warnings.push('Current ask exceeds the suggested valuation; consider passing.');
    if (team.playerIds.length >= room.settings.maxSquadSize) warnings.push('Your squad is full.');
    if (room.status === 'PAUSED') warnings.push('Auction is paused.');
    return { recommendedMinCr: toCr(Math.min(minimum, ceiling)), recommendedMaxCr: toCr(ceiling),
      suggestedCeilingCr: toCr(ceiling), budgetRisk: ceiling > remainingBudget(team) * 0.5 ? 'HIGH' : ceiling > remainingBudget(team) * 0.25 ? 'MEDIUM' : 'LOW',
      squadNeedScore: Math.round(need * 100), scarcityScore: Math.round(scarcity * 100),
      reasons: [`OVR ${player.ovr} and average available stat ${Math.round(averageStats)} inform value.`,
        `${owned} of ${desired} target ${player.position} slots filled.`,
        `${similar} comparable same-position players remain in a pool of ${remaining.length}.`,
        'Ceiling preserves funds for the prospective minimum squad.'], warnings };
  }
}

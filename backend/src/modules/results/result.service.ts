import type { Room } from '../../domain/types.js';
import { toCr } from '../../domain/money.js';
import { publicPlayer, publicTeam } from '../teams/team.service.js';
export function calculateResults(room: Room) {
  const teams = room.teams.map(team => {
    const purchases = room.purchases.filter(p => p.teamId === team.id);
    const players = room.players.filter(p => team.playerIds.includes(p.id));
    return { ...publicTeam(team, room.settings), players: players.map(publicPlayer),
      totalSpentCr: toCr(team.spentUnits),
      highestPurchaseCr: purchases.length ? toCr(Math.max(...purchases.map(p => p.priceUnits))) : null,
      averagePurchaseCr: purchases.length ? toCr(team.spentUnits) / purchases.length : 0,
      positionCounts: Object.fromEntries(['GK', 'DEF', 'MID', 'FWD'].map(position => [position, players.filter(p => p.position === position).length])) };
  });
  const totalUnits = room.purchases.reduce((sum, p) => sum + p.priceUnits, 0);
  const mostExpensive = [...room.purchases].sort((a, b) => b.priceUnits - a.priceUnits)[0];
  const longestWar = [...room.purchases].sort((a, b) => b.bidCount - a.bidCount || b.durationMs - a.durationMs)[0];
  return {
    roomId: room.id, status: room.status, sequence: room.sequence, provisional: room.status !== 'COMPLETED',
    teams, playersSold: room.purchases.length, unsoldCount: room.players.filter(p => p.status === 'UNSOLD').length,
    skippedCount: room.players.filter(p => p.status === 'SKIPPED').length,
    totalSpendCr: toCr(totalUnits), averageSaleCr: room.purchases.length ? toCr(totalUnits) / room.purchases.length : 0,
    mostExpensivePurchase: mostExpensive ? { playerId: mostExpensive.playerId, teamId: mostExpensive.teamId, priceCr: toCr(mostExpensive.priceUnits) } : null,
    highestRemainingBudget: [...teams].sort((a, b) => b.remainingBudgetCr - a.remainingBudgetCr)[0] ?? null,
    longestBiddingWar: longestWar ? { playerId: longestWar.playerId, bidCount: longestWar.bidCount, durationMs: longestWar.durationMs } : null,
    mostPlayersPurchased: [...teams].sort((a, b) => b.playersOwned - a.playersOwned)[0] ?? null,
  };
}

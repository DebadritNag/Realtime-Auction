import type {Standing} from './manager-mode';
import type {Trophy} from './manager-cup';

/** Wire response from GET /manager-mode/:id/club-history. */
export interface ClubHistoryEntry {
  teamId: string;
  trophies: Trophy[];
  record: Standing;
  playersBought: number;
  playersSold: number;
  playersTraded: number;
  transferSpendingUnits: number;
  transferIncomeUnits: number;
  netSpendUnits: number;
  bonusUnits: number;
  currentBudgetUnits: number;
  seasons: {
    seasonId: string;
    number: number;
    leaguePosition: number | null;
    leagueWinner: boolean;
    cupFinish: string;
    bonusUnits: number;
  }[];
}
export type ClubHistory = ClubHistoryEntry[];

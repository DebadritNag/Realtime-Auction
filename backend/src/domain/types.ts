import type { RoomSettings } from '../schemas/settings.js';
export type RoomStatus = 'LOBBY' | 'STARTING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CLOSED';
export type PlayerStatus = 'WAITING' | 'ACTIVE' | 'SOLD' | 'UNSOLD' | 'SKIPPED';
export interface AuthContext { userId: string; username?: string; expiresAt?: number }
export interface Player {
  club?: string; nationality?: string; age?: number; preferredFoot?: string; photoUrl?: string;
  subPosition?: string; secondaryPositions?: string; league?: string; ratingTier?: string;
  id: string; name: string; position: 'GK' | 'DEF' | 'MID' | 'FWD' | 'ATT'; ovr: number;
  stats: Record<string, number>; basePriceUnits: number; potId: string;
}
export interface AuctionPlayer extends Player { status: PlayerStatus; round: number; unsoldReason?: 'UNANIMOUS_SKIP' }
export interface Team {
  id: string; userId: string; managerUsername?: string; name: string; logoUrl?: string; logoEmoji?: string;
  startingBudgetUnits: number; spentUnits: number; playerIds: string[];
}
export interface Bid { id: string; roomId: string; playerId: string; teamId: string; amountUnits: number; at: number; round: number }
export interface Purchase { id: string; playerId: string; teamId: string; priceUnits: number; bidCount: number; at: number; durationMs: number }
export interface ActiveAuction {
  skipVoterUserIds?: string[];
  playerId: string; currentBidUnits: number; highestBidderTeamId: string | null;
  startedAt: number; endsAt: number; biddingOpen: boolean; remainingTimeMs: number | null;
  lastBidAt: number | null; bidCount: number; activationId: string;
}
export interface CommandReceipt { fingerprint: string; sequence: number; expiresAt: number }
export interface Room {
  id: string; code: string; hostUserId: string; auctionName: string; status: RoomStatus;
  createdAt: number; settings: RoomSettings; teams: Team[]; players: AuctionPlayer[];
  active: ActiveAuction | null; playerQueue: string[]; purchases: Purchase[]; bids: Bid[];
  playerHistory?: { type: 'PLAYER_UNSOLD' | 'PLAYER_RECALLED'; playerId: string; round: number; at: number; userId?: string; reason?: 'UNANIMOUS_SKIP' }[];
  // Anti-streak tracking: track the last pot used and how many times in a row
  lastPot?: string; consecutivePotCount?: number;
  sequence: number; nextPlayerAt: number | null; receipts: Record<string, CommandReceipt>;
}
export interface ServerEvent {
  type: string; roomId?: string; sequence: number; serverTime: number;
  requestId?: string; payload: unknown;
}

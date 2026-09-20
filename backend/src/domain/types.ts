import type { RoomSettings } from '../schemas/settings.js';
export type RoomStatus = 'LOBBY' | 'STARTING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CLOSED';
export type PlayerStatus = 'WAITING' | 'ACTIVE' | 'SOLD' | 'UNSOLD' | 'SKIPPED';
export interface AuthContext { userId: string; username?: string; expiresAt?: number }
export interface Player {
  id: string; name: string; position: 'GK' | 'DEF' | 'MID' | 'FWD'; ovr: number;
  stats: Record<string, number>; basePriceUnits: number; potId: string;
}
export interface AuctionPlayer extends Player { status: PlayerStatus; round: number }
export interface Team {
  id: string; userId: string; name: string; logoUrl?: string;
  startingBudgetUnits: number; spentUnits: number; playerIds: string[];
}
export interface Bid { id: string; roomId: string; playerId: string; teamId: string; amountUnits: number; at: number; round: number }
export interface Purchase { id: string; playerId: string; teamId: string; priceUnits: number; bidCount: number; at: number; durationMs: number }
export interface ActiveAuction {
  playerId: string; currentBidUnits: number; highestBidderTeamId: string | null;
  startedAt: number; endsAt: number; biddingOpen: boolean; remainingTimeMs: number | null;
  lastBidAt: number | null; bidCount: number; activationId: string;
}
export interface CommandReceipt { fingerprint: string; sequence: number; expiresAt: number }
export interface Room {
  id: string; code: string; hostUserId: string; auctionName: string; status: RoomStatus;
  createdAt: number; settings: RoomSettings; teams: Team[]; players: AuctionPlayer[];
  active: ActiveAuction | null; playerQueue: string[]; purchases: Purchase[]; bids: Bid[];
  sequence: number; nextPlayerAt: number | null; receipts: Record<string, CommandReceipt>;
}
export interface ServerEvent {
  type: string; roomId?: string; sequence: number; serverTime: number;
  requestId?: string; payload: unknown;
}

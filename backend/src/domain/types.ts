import type { RoomSettings } from '../schemas/settings.js';
export type RoomStatus = 'LOBBY' | 'STARTING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CLOSED';
export type PlayerStatus = 'WAITING' | 'ACTIVE' | 'SOLD' | 'UNSOLD' | 'SKIPPED';
export interface AuthContext { userId: string; username?: string; expiresAt?: number }
export interface Player {
  externalId?: string;
  club?: string; nationality?: string; age?: number; preferredFoot?: string; photoUrl?: string;
  subPosition?: string; secondaryPositions?: string; league?: string; ratingTier?: string;
  id: string; name: string; position: 'GK' | 'DEF' | 'MID' | 'FWD' | 'ATT'; ovr: number;
  stats: Record<string, number>; basePriceUnits: number; potId: string;
  // FC26 database fields (optional: absent for the default FC24 pool and for old snapshots).
  fullName?: string; potential?: number; positions?: string[];
  draftPool?: 'REGULAR' | 'UNDERDOG'; playerTag?: 'UNDERDOG'; sourceCategory?: string; sourceCategories?: string[];
}
/** Metadata of a player added to a live auction. FOLLOW plays after all regular waiting players; HELD waits for the host. */
export interface PoolMeta {
  poolStatus: 'PENDING'; importBatchId: string; importedAt: number; importedBy: string;
  sourceFile: string; sourceCategory: string; release: 'FOLLOW' | 'HELD';
}
export interface AuctionPlayer extends Player { status: PlayerStatus; round: number; unsoldReason?: 'UNANIMOUS_SKIP'; poolMeta?: PoolMeta }
export interface PoolImportRowResult { row: number; playerId: string; name: string; code: string; reason: string }
export interface PoolImportBatch {
  batchId: string; contentHash: string; at: number; by: string; sourceKind: 'CSV' | 'FC26_DATABASE' | 'DEFAULT_POOL';
  sourceFile: string; totalRecords: number; addedPlayerIds: string[]; addedRows: { row: number; playerId: string }[]; categoryCounts: Record<string, number>; heldCount: number;
  skipped: PoolImportRowResult[]; rejected: PoolImportRowResult[];
}
export interface Team {
  id: string; userId: string; managerUsername?: string; name: string; logoUrl?: string; logoEmoji?: string;
  startingBudgetUnits: number; spentUnits: number; playerIds: string[];
}
export interface Bid { id: string; roomId: string; playerId: string; teamId: string; amountUnits: number; at: number; round: number }
export interface Purchase {
  id: string; playerId: string; teamId: string; priceUnits: number; bidCount: number; at: number; durationMs: number;
  // Absent on ordinary auction purchases and old snapshots.
  acquisitionType?: 'AUCTION' | 'RETENTION'; isRetained?: boolean;
}
export type RetentionPhase = 'NOT_STARTED' | 'TEAM_SELECTING' | 'ALL_TEAMS_COMPLETED' | 'FINALIZED';
/** Player data frozen at selection time so announcements and lists do not depend on the catalog. */
export type RetentionSnapshot = Omit<Player, 'basePriceUnits'> & { basePriceUnits: number };
/** Confirmed retention. Optional fields are absent on picks written by the first (free-for-all) implementation. */
export interface RetentionPick {
  id: string; teamId: string; playerId: string; priceUnits: number; at: number; userId: string;
  turnId?: string; order?: number; confirmedAt?: number; confirmedBy?: string; snapshot?: RetentionSnapshot;
}
/** Unconfirmed selection of the active team. Never exposed to other viewers. */
export interface RetentionDraft { teamId: string; playerId: string; snapshot: RetentionSnapshot; at: number }
/** One completed team turn. `id` doubles as the announcement event id. */
export interface RetentionTurn {
  id: string; teamId: string; order: number; kind: 'RETAINED' | 'SKIPPED'; playerIds: string[];
  spentUnits: number; remainingUnits: number; nextTeamId: string | null; allCompleted: boolean; at: number; confirmedBy: string;
}
export interface RoomRetention {
  phase: RetentionPhase; picks: RetentionPick[]; finalizedAt?: number;
  order?: string[]; activeTeamId?: string | null; turns?: RetentionTurn[]; drafts?: RetentionDraft[];
  /** Announcement id for "all teams completed". */
  completion?: { id: string; at: number };
}
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
  // Pre-auction retention sub-phase of LOBBY; present only for rooms with settings.retention.enabled.
  retention?: RoomRetention;
  playerHistory?: { type: 'PLAYER_UNSOLD' | 'PLAYER_RECALLED'; playerId: string; round: number; at: number; userId?: string; reason?: 'UNANIMOUS_SKIP' }[];
  // Anti-streak tracking: track the last pot used and how many times in a row
  lastPot?: string; consecutivePotCount?: number;
  /** Live additions in import order; played after every regular waiting player. Absent on old snapshots. */
  addedQueue?: string[]; poolImports?: PoolImportBatch[];
  sequence: number; nextPlayerAt: number | null; receipts: Record<string, CommandReceipt>;
  /** Epoch ms of the last committed change; falls back to createdAt on old snapshots. */
  lastActivityAt?: number;
}
export interface ServerEvent {
  type: string; roomId?: string; sequence: number; serverTime: number;
  requestId?: string; payload: unknown;
}

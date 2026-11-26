import type { PlayerDTO, RetentionGroup } from './backend';

/** Wire contract of backend/src/modules/restore. Money is in Cr. */
export type RestoreAcquisition = 'RETENTION' | 'AUCTION';
export type RestoreSeverity = 'CRITICAL' | 'WARNING';
export type RestoreMatchKind = 'MATCHED_FC26' | 'MATCHED_DEFAULT_POOL' | 'AMBIGUOUS' | 'UNMATCHED' | 'MANUAL' | 'RESOLVED';

export interface RestoreSnapshotPlayer {
  name: string;
  position: string;
  acquisition: RestoreAcquisition;
  underdog?: boolean;
  /** Set by the host to pick a catalog player. */
  playerId?: string;
  /** Set by the host to create a restored-only player. */
  manual?: { ovr?: number };
  verify?: boolean;
  /** Recorded acquisition price in Cr (history only). Retained players are always 15 Cr. */
  priceCr?: number;
}
export interface RestoreSnapshotTeam {
  name: string;
  squadSize: number;
  remainingPurseCr: number;
  retainedCount: number;
  auctionCount?: number;
  verify?: string;
  players: RestoreSnapshotPlayer[];
}
export interface RestoreSnapshot {
  version: 1;
  name: string;
  hostTeam?: string;
  teams: RestoreSnapshotTeam[];
}
export interface RestoreTemplate {
  id: string;
  name: string;
  teamCount: number;
  playerCount: number;
  hostTeam?: string;
  /** The preset loaded automatically when the restore toggle is switched on. */
  isDefault?: boolean;
  snapshot: RestoreSnapshot;
}

export interface RestoreCandidate {
  playerId: string;
  name: string;
  fullName?: string;
  position: string;
  positions: string[];
  club?: string;
  ovr: number;
  underdog: boolean;
  photoUrl?: string;
  source: 'FC26' | 'DEFAULT_POOL' | 'MANUAL';
}
export interface RestoreMatch {
  kind: RestoreMatchKind;
  playerId?: string;
  source?: 'FC26' | 'DEFAULT_POOL' | 'MANUAL';
  matchedName?: string;
  fullName?: string;
  club?: string;
  ovr?: number;
  photoUrl?: string;
  positions?: string[];
  candidates?: RestoreCandidate[];
  suggestions?: RestoreCandidate[];
}
export interface RestoreIssue {
  severity: RestoreSeverity;
  code: string;
  teamName?: string;
  playerName?: string;
  message: string;
}
export interface RestorePreviewPlayer {
  name: string;
  position: string;
  acquisition: RestoreAcquisition;
  underdog: boolean;
  verify: boolean;
  priceCr?: number;
  match: RestoreMatch;
  issues: RestoreIssue[];
}
export interface RestorePreviewTeam {
  name: string;
  squadSize: number;
  actualPlayers: number;
  remainingSlots: number;
  remainingPurseCr: number;
  retainedCount: number;
  auctionCount: number;
  verify?: string;
  players: RestorePreviewPlayer[];
}
export interface RestorePotCounts {
  GK?: number;
  CB?: number;
  FB?: number;
  MID?: number;
  ATT?: number;
  [pot: string]: number | undefined;
}
export interface RestorePreview {
  name: string;
  teams: RestorePreviewTeam[];
  issues: RestoreIssue[];
  totals: { teams: number; players: number; retained: number; auction: number; matchedFc26: number; matchedDefaultPool: number; manual: number; unresolved: number };
  remainingPool: { total: number; byPot: RestorePotCounts };
  canConfirm: boolean;
}

/** Only the timer related settings are accepted by POST /restore/rooms. */
export interface RestoreRoomSettingsInput {
  playerTimerSeconds?: number;
  antiSnipingEnabled?: boolean;
  antiSnipingThresholdSeconds?: number;
  antiSnipingResetSeconds?: number;
}
/** reserved: a host-bound user owns it. reservedForYou: the caller is that user. Never carries user ids. */
export interface RestoreRoomTeamPublic { id: string; name: string; claimed: boolean; reserved?: boolean; reservedForYou?: boolean }
/** A registered user the host can bind to a restored team. */
export interface RestoreUserHit { userId: string; username: string; displayName: string }
export interface RestoreBinding { teamName: string; userId: string }
export interface RestoreCreateResponse {
  roomId: string;
  roomCode: string;
  restore: { source: 'TEMPLATE' | 'CUSTOM'; snapshotName: string; warnings: string[]; teams: RestoreRoomTeamPublic[] };
  remainingPool: { total: number; byPot: RestorePotCounts };
}

/** GET /rooms/:code extra block, present for restored rooms only. */
export interface RestoreRoomInfo { snapshotName: string; teams: RestoreRoomTeamPublic[] }
export interface RoomLookupDTO { roomCode: string; auctionName: string; status: string; restore?: RestoreRoomInfo }

/** ROOM_STATE.restore for restored rooms (null otherwise). */
export interface RestoreStateDTO {
  enabled: boolean;
  source: 'TEMPLATE' | 'CUSTOM';
  snapshotName: string;
  restoredAt: number;
  warnings: string[];
  unclaimedCount: number;
  teams: {
    teamId: string;
    name: string;
    claimed: boolean;
    /** Snapshot name; the manager may have renamed the team since. */
    originalName?: string;
    reserved?: boolean;
    /** Display name of the user the host bound to this team. */
    reservedLabel?: string;
    purseCr: number;
    openingPurseCr: number;
    squadSize: number;
    remainingSlots: number;
    retainedCount: number;
    auctionCount: number;
  }[];
}

export interface RestorePlayerSearchResponse { total: number; offset: number; limit: number; players: PlayerDTO[] }
export interface RestorePoolResponse {
  total: number;
  offset: number;
  limit: number;
  poolTotal: number;
  byPot: RestorePotCounts;
  ownedCount: number;
  players: PlayerDTO[];
  sequence: number;
}
export type RestorePoolGroup = RetentionGroup;
export interface RestorePoolQuery { search?: string; group?: RestorePoolGroup; offset?: number; limit?: number }

import type { Player } from '../../domain/types.js';
export type RestoreSource = 'FC26' | 'DEFAULT_POOL' | 'MANUAL';
export type MatchKind = 'MATCHED_FC26' | 'MATCHED_DEFAULT_POOL' | 'AMBIGUOUS' | 'UNMATCHED' | 'MANUAL' | 'RESOLVED';
export interface CandidateSummary { playerId: string; name: string; fullName?: string; position: string; positions: string[]; club?: string; ovr: number; underdog: boolean; photoUrl?: string; source: RestoreSource }
/** Server-side result of matching one snapshot entry. `player` is internal and never sent to clients. */
export interface MatchResult {
  kind: MatchKind; source?: RestoreSource; player?: Player;
  candidates?: CandidateSummary[]; suggestions?: CandidateSummary[];
}
export type IssueSeverity = 'CRITICAL' | 'WARNING';
export interface RestoreIssue { severity: IssueSeverity; code: string; teamName?: string; playerName?: string; message: string }
export interface PreviewPlayer {
  name: string; position: string; acquisition: 'RETENTION' | 'AUCTION'; underdog: boolean; verify: boolean;
  match: { kind: MatchKind; playerId?: string; source?: RestoreSource; matchedName?: string; fullName?: string; club?: string; ovr?: number; photoUrl?: string;
    positions?: string[]; candidates?: CandidateSummary[]; suggestions?: CandidateSummary[] };
  issues: RestoreIssue[];
}
export interface PreviewTeam {
  name: string; squadSize: number; actualPlayers: number; remainingSlots: number; remainingPurseCr: number; retainedCount: number; auctionCount: number;
  verify?: string; players: PreviewPlayer[];
}
export interface RestorePreview {
  name: string; teams: PreviewTeam[]; issues: RestoreIssue[];
  totals: { teams: number; players: number; retained: number; auction: number; matchedFc26: number; matchedDefaultPool: number; manual: number; unresolved: number };
  remainingPool: { total: number; byPot: Record<string, number> };
  canConfirm: boolean;
}
export const MAX_SQUAD_SIZE = 20;
export const MAX_RETAINED_PER_TEAM = 3;

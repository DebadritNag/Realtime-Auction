import type { Room, Team } from '../../domain/types.js';
import { requireThat } from '../../domain/errors.js';
/** A restored team nobody manages yet carries this sentinel instead of a user id. It is unique per team and never equals a real user id. */
export const UNCLAIMED_PREFIX = 'unclaimed:';
export const unclaimedUserId = (teamId: string): string => UNCLAIMED_PREFIX + teamId;
export const isUnclaimed = (team: Pick<Team, 'userId'>): boolean => team.userId.startsWith(UNCLAIMED_PREFIX);
/** Frees the team for another manager. The team, its squad and its purse stay untouched. */
export function releaseTeamClaim(team: Team): void {
  team.userId = unclaimedUserId(team.id);
  delete team.managerUsername;
}
/** Restored purses, squads and capacity are fixed in the lobby; only timers and similar options may change. */
export const RESTORE_LOCKED_SETTINGS = ['startingBudgetCr', 'maxSquadSize', 'numberOfTeams', 'playerPoolSource', 'retention'] as const;
export function assertRestoreSettingsUnlocked(room: Room, next: Record<string, unknown>): void {
  if (!room.restore) return;
  const current = room.settings as Record<string, unknown>;
  for (const key of RESTORE_LOCKED_SETTINGS) {
    requireThat(JSON.stringify(current[key]) === JSON.stringify(next[key]), 'RESTORE_SETTINGS_LOCKED',
      `${key} cannot be changed in a restored auction.`, 409);
  }
}

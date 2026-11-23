import type { Room, Team } from '../../domain/types.js';
import { requireThat } from '../../domain/errors.js';
/** A restored team nobody manages yet carries this sentinel instead of a user id. It is unique per team and never equals a real user id. */
export const UNCLAIMED_PREFIX = 'unclaimed:';
export const unclaimedUserId = (teamId: string): string => UNCLAIMED_PREFIX + teamId;
export const isUnclaimed = (team: Pick<Team, 'userId'>): boolean => team.userId.startsWith(UNCLAIMED_PREFIX);
/** Frees the team for another manager. The team, its squad, its purse and any host reservation stay untouched. */
export function releaseTeamClaim(team: Team): void {
  team.userId = unclaimedUserId(team.id);
  delete team.managerUsername;
}
export function unbindTeam(team: Team): void {
  delete team.reservedUserId;
  delete team.reservedLabel;
}
/** Host intent: frees the claim and drops the reservation. */
export function releaseAndUnbind(team: Team): void {
  releaseTeamClaim(team);
  unbindTeam(team);
}
/** One user holds at most one team (claimed or reserved); the host team is never bindable. */
export function assertBindable(room: Room, team: Team, userId: string): void {
  requireThat(team.userId !== room.hostUserId, 'HOST_TEAM_NOT_BINDABLE', 'The host team cannot be reserved for another user.', 422);
  requireThat(userId !== room.hostUserId, 'USER_ALREADY_BOUND', 'The host already manages a team.', 409);
  requireThat(!room.teams.some(t => t.id !== team.id && (t.reservedUserId === userId || t.userId === userId)),
    'USER_ALREADY_BOUND', 'That user is already bound to another team.', 409);
  requireThat(isUnclaimed(team) || team.userId === userId, 'TEAM_ALREADY_CLAIMED', 'Release that team before reserving it for someone else.', 409);
}
export function bindTeam(room: Room, team: Team, userId: string, label: string): void {
  assertBindable(room, team, userId);
  team.reservedUserId = userId;
  team.reservedLabel = label;
}
/** Per-team claim and reservation status for a viewer. Never exposes user ids. */
export function describeTeams(room: Room, viewerId: string) {
  return room.teams.map(t => ({ id: t.id, name: t.name, claimed: !isUnclaimed(t), reserved: !!t.reservedUserId, reservedForYou: t.reservedUserId === viewerId }));
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

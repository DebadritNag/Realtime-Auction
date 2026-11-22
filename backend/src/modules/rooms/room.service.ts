import { randomUUID } from 'node:crypto';
import type { Room, Team } from '../../domain/types.js';
import { requireThat } from '../../domain/errors.js';
import { toUnits } from '../../domain/money.js';
import { parseSettings, type RoomSettings } from '../../schemas/settings.js';
import type { RoomManager } from './room.manager.js';
import { assertRetentionSettingsUnlocked, requireRetentionOpenForMembership, syncRetentionWithSettings } from '../retention/retention.service.js';
import { assertRestoreSettingsUnlocked, isUnclaimed, releaseTeamClaim } from '../restore/restore.claims.js';
export function requireMember(room: Room, userId: string): Team {
  const team = room.teams.find(t => t.userId === userId);
  requireThat(team, 'NOT_ROOM_MEMBER', 'You are not a member of this room.', 403);
  return team;
}
export function requireHost(room: Room, userId: string): void {
  requireThat(room.hostUserId === userId, 'HOST_REQUIRED', 'Only the host can do this.', 403);
}
export class RoomService {
  constructor(private manager: RoomManager) {}
  async join(code: string, userId: string, input: { teamName?: string; teamLogoUrl?: string; teamLogoEmoji?: string; restoredTeamId?: string }, managerUsername?: string): Promise<Team> {
    return this.manager.mutate(code, (room, events) => {
      if (room.restore) {
        // Restored rooms never create teams: a manager claims one of the restored teams. Submitted name and logo are ignored.
        requireThat(input.restoredTeamId, 'RESTORED_TEAM_REQUIRED', 'Choose which restored team you manage.', 400);
        const target = room.teams.find(t => t.id === input.restoredTeamId);
        requireThat(target, 'TEAM_NOT_FOUND', 'Team does not exist.', 404);
        const own = room.teams.find(t => t.userId === userId);
        if (own) {
          requireThat(own.id === target.id, 'ALREADY_CLAIMED_ANOTHER_TEAM', 'You already manage another team in this auction.', 409);
          return own;
        }
        requireThat(room.status === 'LOBBY', 'INVALID_STATE', 'Join is only available in the lobby.', 409);
        requireThat(isUnclaimed(target), 'TEAM_ALREADY_CLAIMED', 'That team already has a manager.', 409);
        target.userId = userId;
        if (managerUsername) target.managerUsername = managerUsername; else delete target.managerUsername;
        events.push({ type: 'MEMBER_JOINED', payload: { teamId: target.id } }, { type: 'ROOM_UPDATED', payload: { reason: 'TEAM_CLAIMED' } });
        return target;
      }
      requireThat(!input.restoredTeamId, 'NOT_A_RESTORED_ROOM', 'This auction was not restored from a snapshot.', 400);
      const teamName = input.teamName;
      requireThat(teamName, 'VALIDATION_ERROR', 'teamName is required.', 400);
      const existing = room.teams.find(t => t.userId === userId);
      if (existing) {
        requireThat(existing.name === input.teamName && existing.logoUrl === input.teamLogoUrl && existing.logoEmoji === input.teamLogoEmoji, 'MEMBERSHIP_CONFLICT', 'Already joined with different team details.', 409);
        return existing;
      }
      requireThat(room.status === 'LOBBY', 'INVALID_STATE', 'Join is only available in the lobby.', 409);
      requireRetentionOpenForMembership(room);
      requireThat(room.teams.length < room.settings.numberOfTeams, 'ROOM_FULL', 'Room is full.', 409);
      requireThat(!room.teams.some(t => t.name.toLowerCase() === teamName.toLowerCase()), 'TEAM_NAME_TAKEN', 'Team name is already taken.', 409);
      const team: Team = { id: randomUUID(), userId, managerUsername, name: teamName, logoUrl: input.teamLogoUrl, logoEmoji: input.teamLogoEmoji,
        startingBudgetUnits: toUnits(room.settings.startingBudgetCr), spentUnits: 0, playerIds: [] };
      room.teams.push(team);
      events.push({ type: 'MEMBER_JOINED', payload: { teamId: team.id } });
      return team;
    });
  }
  async leave(code: string, userId: string): Promise<void> {
    await this.manager.mutate(code, (room, events) => {
      requireMember(room, userId);
      requireThat(room.status === 'LOBBY', 'INVALID_STATE', 'Teams cannot leave a started auction.', 409);
      requireThat(room.hostUserId !== userId, 'HOST_CANNOT_LEAVE', 'Host must close the room instead.');
      requireRetentionOpenForMembership(room);
      // A restored team owns purchases and a purse: leaving frees the claim instead of deleting the team.
      if (room.restore) releaseTeamClaim(room.teams.find(t => t.userId === userId)!);
      else room.teams = room.teams.filter(t => t.userId !== userId);
      events.push({ type: 'MEMBER_LEFT', payload: { userId } });
    });
  }
  async updateSettings(code: string, userId: string, patch: Partial<RoomSettings>): Promise<void> {
    await this.manager.mutate(code, async (room, events) => {
      requireHost(room, userId);
      requireThat(room.status === 'LOBBY', 'INVALID_STATE', 'Settings are locked after auction start.', 409);
      const settings = parseSettings({ ...room.settings, ...patch });
      await this.manager.assertPoolSource(settings);
      requireThat(settings.numberOfTeams >= room.teams.length, 'ROOM_FULL', 'Cannot reduce capacity below membership.');
      assertRetentionSettingsUnlocked(room, settings);
      assertRestoreSettingsUnlocked(room, settings);
      room.settings = settings;
      syncRetentionWithSettings(room);
      // Restored purses are authoritative; a settings update must never overwrite them.
      if (!room.restore) for (const team of room.teams) team.startingBudgetUnits = toUnits(settings.startingBudgetCr);
      events.push({ type: 'ROOM_UPDATED' });
    });
  }
}

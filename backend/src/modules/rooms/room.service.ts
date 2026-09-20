import { randomUUID } from 'node:crypto';
import type { Room, Team } from '../../domain/types.js';
import { requireThat } from '../../domain/errors.js';
import { toUnits } from '../../domain/money.js';
import { settingsSchema, type RoomSettings } from '../../schemas/settings.js';
import type { RoomManager } from './room.manager.js';
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
  async join(code: string, userId: string, input: { teamName: string; teamLogoUrl?: string }): Promise<Team> {
    return this.manager.mutate(code, (room, events) => {
      const existing = room.teams.find(t => t.userId === userId);
      if (existing) {
        requireThat(existing.name === input.teamName && existing.logoUrl === input.teamLogoUrl, 'MEMBERSHIP_CONFLICT', 'Already joined with different team details.', 409);
        return existing;
      }
      requireThat(room.status === 'LOBBY', 'INVALID_STATE', 'Join is only available in the lobby.', 409);
      requireThat(room.teams.length < room.settings.numberOfTeams, 'ROOM_FULL', 'Room is full.', 409);
      requireThat(!room.teams.some(t => t.name.toLowerCase() === input.teamName.toLowerCase()), 'TEAM_NAME_TAKEN', 'Team name is already taken.', 409);
      const team: Team = { id: randomUUID(), userId, name: input.teamName, logoUrl: input.teamLogoUrl,
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
      room.teams = room.teams.filter(t => t.userId !== userId);
      events.push({ type: 'MEMBER_LEFT', payload: { userId } });
    });
  }
  async updateSettings(code: string, userId: string, patch: Partial<RoomSettings>): Promise<void> {
    await this.manager.mutate(code, (room, events) => {
      requireHost(room, userId);
      requireThat(room.status === 'LOBBY', 'INVALID_STATE', 'Settings are locked after auction start.', 409);
      const settings = settingsSchema.parse({ ...room.settings, ...patch });
      requireThat(settings.numberOfTeams >= room.teams.length, 'ROOM_FULL', 'Cannot reduce capacity below membership.');
      room.settings = settings;
      for (const team of room.teams) team.startingBudgetUnits = toUnits(settings.startingBudgetCr);
      events.push({ type: 'ROOM_UPDATED' });
    });
  }
}

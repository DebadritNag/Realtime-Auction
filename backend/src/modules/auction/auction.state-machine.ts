import type { Room, RoomStatus, AuctionPlayer, PlayerStatus } from '../../domain/types.js';
import { requireThat } from '../../domain/errors.js';
const transitions: Record<RoomStatus, RoomStatus[]> = {
  LOBBY: ['STARTING', 'CLOSED'], STARTING: ['RUNNING'], RUNNING: ['PAUSED', 'COMPLETED'],
  PAUSED: ['RUNNING', 'COMPLETED'], COMPLETED: ['CLOSED'], CLOSED: [],
};
export function transitionRoom(room: Room, next: RoomStatus): void {
  requireThat(transitions[room.status].includes(next), 'INVALID_STATE', `Cannot transition ${room.status} to ${next}.`, 409);
  room.status = next;
}
export function transitionPlayer(player: AuctionPlayer, next: PlayerStatus): void {
  const allowed: Record<PlayerStatus, PlayerStatus[]> = { WAITING: ['ACTIVE', 'SKIPPED'], ACTIVE: ['SOLD', 'UNSOLD'], SOLD: [], UNSOLD: ['ACTIVE'], SKIPPED: [] };
  requireThat(allowed[player.status].includes(next), 'INVALID_STATE', `Cannot transition player ${player.status} to ${next}.`, 409);
  player.status = next;
}

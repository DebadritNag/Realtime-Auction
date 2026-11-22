import type { AuctionPlayer, Room } from '../../../domain/types.js';

export type CategoryState = 'ACTIVE' | 'COMPLETED' | 'NOT_IN_AUCTION';
const queued = (room: Room): Set<string> => new Set(room.addedQueue ?? []);

export const isQueued = (room: Room, id: string): boolean => (room.addedQueue ?? []).includes(id);
/** Queued addition that waits for an explicit host release. */
export const isHeld = (room: Room, player: AuctionPlayer): boolean =>
  player.status === 'WAITING' && player.poolMeta?.release === 'HELD' && isQueued(room, player.id);
/** WAITING players that take part in the ordinary random selection (not live additions). */
export function regularWaiting(room: Room): AuctionPlayer[] {
  const added = queued(room);
  return room.players.filter(p => p.status === 'WAITING' && !added.has(p.id));
}
/** Ids of released additions in import order. */
export function followIds(room: Room): string[] {
  return (room.addedQueue ?? []).filter(id => {
    const p = room.players.find(x => x.id === id);
    return p?.status === 'WAITING' && p.poolMeta?.release === 'FOLLOW';
  });
}
export const heldIds = (room: Room): string[] => (room.addedQueue ?? []).filter(id => {
  const p = room.players.find(x => x.id === id);
  return p !== undefined && isHeld(room, p);
});
/** True when activateNext can pick a player. Held additions never count. */
export const hasSelectable = (room: Room): boolean =>
  room.playerQueue.length > 0 || regularWaiting(room).length > 0 || followIds(room).length > 0;
/**
 * A pot is ACTIVE while regular waiting players, the live lot, a recall queue entry or a released addition of that pot remain.
 * Otherwise COMPLETED when the room has players of that pot, NOT_IN_AUCTION when it has none.
 */
export function categoryState(room: Room, potId: string): CategoryState {
  const live = room.active ? room.players.find(p => p.id === room.active!.playerId) : undefined;
  const byId = (id: string) => room.players.find(p => p.id === id);
  const active = regularWaiting(room).some(p => p.potId === potId) || live?.potId === potId
    || room.playerQueue.some(id => byId(id)?.potId === potId) || followIds(room).some(id => byId(id)?.potId === potId);
  if (active) return 'ACTIVE';
  return room.players.some(p => p.potId === potId) ? 'COMPLETED' : 'NOT_IN_AUCTION';
}

import type { RetentionGroup, RetentionPlayersResponse } from '@/types/backend';
import { api } from './api';
import { validRoomCode } from './room.service';
import { webSocketService } from './websocket.service';

export interface RetentionPlayersQuery {
  search?: string;
  group?: RetentionGroup;
  offset?: number;
  limit?: number;
}

/** Thin command wrappers. The server owns the active team, limits, purse and availability. */
export const retentionService = {
  players(roomCode: string, query: RetentionPlayersQuery = {}, signal?: AbortSignal) {
    const params = new URLSearchParams();
    const search = query.search?.trim();
    if (search) params.set('search', search);
    if (query.group && query.group !== 'ALL') params.set('group', query.group);
    if (query.offset) params.set('offset', String(query.offset));
    params.set('limit', String(query.limit ?? 50));
    return api.get<RetentionPlayersResponse>(
      '/rooms/' + validRoomCode(roomCode) + '/retention/players?' + params.toString(),
      { signal }
    );
  },
  start: (roomCode: string) => webSocketService.send({ type: 'START_RETENTION', payload: { roomCode } }),
  select: (roomCode: string, playerId: string) =>
    webSocketService.send({ type: 'RETAIN_PLAYER', payload: { roomCode, playerId } }),
  remove: (roomCode: string, playerId: string) =>
    webSocketService.send({ type: 'REMOVE_RETENTION_PLAYER', payload: { roomCode, playerId } }),
  confirm: (roomCode: string) => webSocketService.send({ type: 'CONFIRM_RETENTION', payload: { roomCode } }),
  skip: (roomCode: string) => webSocketService.send({ type: 'SKIP_RETENTION', payload: { roomCode } }),
  finalize: (roomCode: string) =>
    webSocketService.send({ type: 'FINALIZE_RETENTIONS', payload: { roomCode } }),
  reset: (roomCode: string) =>
    webSocketService.send({ type: 'RESET_RETENTIONS', payload: { roomCode } }),
};

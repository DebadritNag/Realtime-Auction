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
  retain: (roomCode: string, playerId: string) =>
    webSocketService.send({ type: 'RETAIN_PLAYER', payload: { roomCode, playerId } }),
  finalize: (roomCode: string) =>
    webSocketService.send({ type: 'FINALIZE_RETENTIONS', payload: { roomCode } }),
  reset: (roomCode: string) =>
    webSocketService.send({ type: 'RESET_RETENTIONS', payload: { roomCode } }),
};

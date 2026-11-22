import { api } from './api';
import { validRoomCode } from './room.service';
import type {
  RestoreCandidate, RestoreCreateResponse, RestorePlayerSearchResponse, RestorePoolQuery, RestorePoolResponse, RestorePreview,
  RestoreRoomSettingsInput, RestoreRoomTeamPublic, RestoreSnapshot, RestoreTemplate, RoomLookupDTO,
} from '@/types/restore';

function listParams(query: RestorePoolQuery, defaultLimit: number) {
  const params = new URLSearchParams();
  const search = query.search?.trim();
  if (search) params.set('search', search);
  if (query.group && query.group !== 'ALL') params.set('group', query.group);
  if (query.offset) params.set('offset', String(query.offset));
  params.set('limit', String(query.limit ?? defaultLimit));
  return params.toString();
}

/** Thin wrappers over the restore API. The server validates and recomputes everything; nothing here is trusted. */
export const restoreService = {
  async templates() {
    return (await api.get<{ templates: RestoreTemplate[] }>('/restore/templates')).templates;
  },
  async preview(snapshot: RestoreSnapshot) {
    return (await api.post<{ preview: RestorePreview }>('/restore/preview', { snapshot })).preview;
  },
  create(input: { auctionName: string; hostTeamName?: string; snapshot: RestoreSnapshot; settings?: RestoreRoomSettingsInput }) {
    return api.post<RestoreCreateResponse>('/restore/rooms', input);
  },
  /** Host resolution search before the room exists. */
  searchPlayers(query: RestorePoolQuery, signal?: AbortSignal) {
    const params = listParams({ ...query, search: query.search?.trim() || undefined }, 20);
    return api.get<RestorePlayerSearchResponse>('/restore/players?' + params, { signal });
  },
  pool(roomCode: string, query: RestorePoolQuery = {}, signal?: AbortSignal) {
    return api.get<RestorePoolResponse>('/rooms/' + validRoomCode(roomCode) + '/restore/pool?' + listParams(query, 50), { signal });
  },
  /** Catalog search for the host's resolution step, shaped like the matcher's candidates. */
  async searchCandidates(query: RestorePoolQuery, signal?: AbortSignal): Promise<RestoreCandidate[]> {
    const res = await restoreService.searchPlayers(query, signal);
    return res.players.map((p) => ({
      playerId: p.id, name: p.name, position: p.subPosition || p.position, positions: p.positions ?? [],
      club: p.club, ovr: p.ovr, underdog: p.playerTag === 'UNDERDOG', photoUrl: p.photoUrl, source: 'FC26' as const,
    }));
  },
  release(roomCode: string, teamId: string) {
    return api.post<{ teams: RestoreRoomTeamPublic[]; sequence: number }>('/rooms/' + validRoomCode(roomCode) + '/restore/release', { teamId });
  },
  /** GET /rooms/:code. `restore` is present only for restored rooms. */
  lookup(roomCode: string, signal?: AbortSignal) {
    return api.get<RoomLookupDTO>('/rooms/' + validRoomCode(roomCode), { signal });
  },
};

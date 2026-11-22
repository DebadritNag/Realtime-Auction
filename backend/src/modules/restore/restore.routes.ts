import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Player } from '../../domain/types.js';
import { DomainError, requireThat } from '../../domain/errors.js';
import { roomCodeSchema } from '../../schemas/settings.js';
import type { RoomManager } from '../rooms/room.manager.js';
import { requireHost, requireMember } from '../rooms/room.service.js';
import { publicPlayer, publicTeam } from '../teams/team.service.js';
import { csvRowToPlayer, parseCsv } from '../players/player.service.js';
import { matchesPositionGroup, type PositionGroup } from '../fc26/fc26.positions.js';
import { buildRestoredRoom } from './restore.build.js';
import { isUnclaimed, releaseTeamClaim } from './restore.claims.js';
import { restoreCreateBodySchema, restorePreviewBodySchema, restoreReleaseBodySchema, restoreSnapshotSchema, type RestoreSnapshot } from './restore.schema.js';
import { snapshotHash, validateSnapshot, type RestoreCatalogs } from './restore.validate.js';
/** The 99-player snapshot exceeds the global 16 KB limit, so only the snapshot-carrying routes accept larger bodies. */
export const RESTORE_BODY_LIMIT = 256 * 1024;
const TEMPLATE_DIR = fileURLToPath(new URL('../../../data/restore', import.meta.url));
const DEFAULT_POOL_FILE = fileURLToPath(new URL('../../../data/default-pool/default-player-pool.csv', import.meta.url));
export interface RestoreTemplate { id: string; snapshot: RestoreSnapshot; hash: string }
/** Reads and validates the shipped templates (strict UTF-8). Invalid files are skipped, never served. */
export async function loadRestoreTemplates(dir = TEMPLATE_DIR): Promise<RestoreTemplate[]> {
  let names: string[];
  try { names = (await readdir(dir)).filter(n => n.endsWith('.json')).sort(); } catch { return []; }
  const templates: RestoreTemplate[] = [];
  for (const name of names) {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(join(dir, name)));
      const snapshot = restoreSnapshotSchema.parse(JSON.parse(text.replace(/^\uFEFF/, '')));
      templates.push({ id: name.replace(/\.json$/, ''), snapshot, hash: snapshotHash(snapshot) });
    } catch { /* skip an unreadable or invalid template */ }
  }
  return templates;
}
let defaultPool: Promise<Player[]> | undefined;
/** Default FC24 pool rows, used only as a matching fallback. A missing file simply yields no fallback. */
export function loadDefaultPoolPlayers(): Promise<Player[]> {
  defaultPool ??= readFile(DEFAULT_POOL_FILE, 'utf8').then(text => parseCsv(text).map(csvRowToPlayer).filter(p => p.id && p.name), () => []);
  return defaultPool;
}
const haystack = (p: Player): string => [p.name, p.fullName, p.club, p.nationality, p.id, p.league, ...(p.positions ?? [])].filter(Boolean).join(' ').toLowerCase();
export function registerRestoreRoutes(app: FastifyInstance, manager: RoomManager): void {
  const params = z.object({ code: roomCodeSchema });
  const catalogs = async (): Promise<RestoreCatalogs> => {
    const fc26 = manager.fc26;
    requireThat(fc26, 'FC26_UNAVAILABLE', 'FC26 database is not configured on this server.', 503);
    const fc26Players = await fc26.list();
    requireThat(fc26Players.length > 0, 'FC26_CATALOG_EMPTY', 'The FC26 database has no players. Import the FC26 CSV files first.', 409);
    return { fc26Players, defaultPool: await loadDefaultPoolPlayers() };
  };
  app.get('/api/restore/templates', async () => {
    const templates = await loadRestoreTemplates();
    return { templates: templates.map(t => ({ id: t.id, name: t.snapshot.name, teamCount: t.snapshot.teams.length,
      playerCount: t.snapshot.teams.reduce((sum, team) => sum + team.players.length, 0), hostTeam: t.snapshot.hostTeam ?? null, snapshot: t.snapshot })) };
  });
  // Catalog search for the host to resolve an unmatched or ambiguous entry before a room exists.
  app.get('/api/restore/players', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async request => {
    const query = z.object({
      search: z.string().trim().min(1).max(100),
      group: z.enum(['ALL', 'GK', 'CB', 'FB', 'CM', 'CDM', 'CMID', 'CAM', 'WM', 'ST', 'W']).default('ALL'),
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }).strict().parse(request.query);
    const fc26 = manager.fc26;
    requireThat(fc26, 'FC26_UNAVAILABLE', 'FC26 database is not configured on this server.', 503);
    const result = await fc26.search({ query: query.search, group: query.group as PositionGroup, offset: query.offset, limit: query.limit });
    return { total: result.total, offset: query.offset, limit: query.limit, players: result.players.map(publicPlayer) };
  });
  app.post('/api/restore/preview', { bodyLimit: RESTORE_BODY_LIMIT, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async request => {
    const { snapshot } = restorePreviewBodySchema.parse(request.body);
    const { preview } = validateSnapshot(snapshot, await catalogs());
    return { preview };
  });
  app.post('/api/restore/rooms', { bodyLimit: RESTORE_BODY_LIMIT, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = restoreCreateBodySchema.parse(request.body);
    const { snapshot } = body;
    const data = await catalogs();
    // Everything is validated again here; a client-side preview is never trusted.
    const validation = validateSnapshot(snapshot, data);
    if (!validation.preview.canConfirm) throw new DomainError('RESTORE_VALIDATION_FAILED', 'The snapshot has critical issues that must be resolved first.', 422,
      { issues: validation.preview.issues.filter(i => i.severity === 'CRITICAL'), preview: validation.preview });
    const hash = snapshotHash(snapshot);
    const source = (await loadRestoreTemplates()).some(t => t.hash === hash) ? 'TEMPLATE' : 'CUSTOM';
    const fc26 = manager.fc26!;
    const room = await manager.createFromBuilder(ctx => buildRestoredRoom({ ctx, host: { userId: request.auth.userId, username: request.auth.username },
      auctionName: body.auctionName, hostTeamName: body.hostTeamName, snapshot, validation, source, topRatingThreshold: fc26.topRatingThreshold,
      settings: body.settings }));
    const hostTeam = room.teams.find(t => t.userId === room.hostUserId)!;
    return reply.code(201).send({ roomId: room.id, roomCode: room.code, settings: room.settings, host: { userId: room.hostUserId, teamId: hostTeam.id },
      team: publicTeam(hostTeam, room.settings, room.retention, room.restore),
      restore: { source: room.restore!.source, snapshotName: room.restore!.snapshotName, warnings: room.restore!.warnings,
        teams: room.teams.map(t => ({ id: t.id, name: t.name, claimed: !isUnclaimed(t) })) },
      remainingPool: validation.preview.remainingPool });
  });
  // Host-only: frees a wrongly claimed restored team (never the host's own team).
  app.post('/api/rooms/:code/restore/release', async request => {
    const { code } = params.parse(request.params);
    const { teamId } = restoreReleaseBodySchema.parse(request.body);
    await manager.mutate(code, (room, events) => {
      requireHost(room, request.auth.userId);
      requireThat(room.restore, 'NOT_A_RESTORED_ROOM', 'This auction was not restored from a snapshot.', 400);
      requireThat(room.status === 'LOBBY', 'INVALID_STATE', 'Claims can only be changed in the lobby.', 409);
      const team = room.teams.find(t => t.id === teamId);
      requireThat(team, 'TEAM_NOT_FOUND', 'Team does not exist.', 404);
      requireThat(team.userId !== room.hostUserId, 'HOST_CANNOT_LEAVE', 'You cannot release your own team.', 409);
      requireThat(!isUnclaimed(team), 'TEAM_NOT_CLAIMED', 'That team has no manager.', 409);
      const userId = team.userId;
      releaseTeamClaim(team);
      events.push({ type: 'MEMBER_LEFT', payload: { teamId, userId } }, { type: 'ROOM_UPDATED', payload: { reason: 'TEAM_RELEASED' } });
    });
    const room = await manager.loadRoom(code);
    return { teams: room.teams.map(t => ({ id: t.id, name: t.name, claimed: !isUnclaimed(t) })), sequence: room.sequence };
  });
  // Member-only: the players that will be auctioned (FC26 catalog minus every owned player, honoring the pot filters).
  app.get('/api/rooms/:code/restore/pool', async request => {
    const { code } = params.parse(request.params);
    const query = z.object({
      search: z.string().trim().max(100).optional(),
      group: z.enum(['ALL', 'GK', 'CB', 'FB', 'CM', 'CDM', 'CMID', 'CAM', 'WM', 'ST', 'W']).default('ALL'),
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).strict().parse(request.query);
    const room = await manager.loadRoom(code);
    requireMember(room, request.auth.userId);
    requireThat(room.restore, 'NOT_A_RESTORED_ROOM', 'This auction was not restored from a snapshot.', 400);
    const fc26 = manager.fc26;
    requireThat(fc26, 'FC26_UNAVAILABLE', 'FC26 database is not configured on this server.', 503);
    const owned = new Set([...room.teams.flatMap(t => t.playerIds), ...room.players.filter(p => p.status === 'SOLD').map(p => p.id)]);
    const { playerIds, potIds } = room.settings.playerPoolConfig;
    const eligible = (await fc26.list()).filter(p => !owned.has(p.id) && (!playerIds || playerIds.includes(p.id)) && (!potIds || potIds.includes(p.potId)));
    const byPot: Record<string, number> = {};
    for (const p of eligible) byPot[p.potId] = (byPot[p.potId] ?? 0) + 1;
    const tokens = (query.search ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const matches = eligible.filter(p => matchesPositionGroup(p.positions ?? [p.subPosition ?? p.position], query.group as PositionGroup) && tokens.every(t => haystack(p).includes(t)));
    return { total: matches.length, offset: query.offset, limit: query.limit, poolTotal: eligible.length, byPot, ownedCount: owned.size,
      players: matches.slice(query.offset, query.offset + query.limit).map(publicPlayer), sequence: room.sequence };
  });
}

import { requireThat } from '../../../domain/errors.js';
import { toUnits } from '../../../domain/money.js';
import { defaultPoolBasePriceCr, fc26BasePriceUnits, type DraftPool } from '../../../domain/pricing.js';
import type { Player } from '../../../domain/types.js';
import { fc26RecordFromEntry, fc26RowSchema } from '../../fc26/fc26.importer.js';
import { broadPosition, isKnownPosition, potForPosition } from '../../fc26/fc26.positions.js';
import { csvRowToPlayer, parseCsv } from '../../players/player.service.js';
import { POOL_IMPORT_LIMITS, type PoolCandidate } from './pool-import.types.js';

export interface PricingContext { roomSource: 'DEFAULT' | 'FC26'; topRatingThreshold: number; minimumBasePriceUnits: number }
const FC26_COLUMNS = 'player_id, player_positions, overall, short_name (or long_name); optional potential, nationality_name, club_name, league_name, age, preferred_foot, pace, shooting, passing, dribbling, defending, physic, player_face_url, draft_pool, underdog_tag';
const DEFAULT_COLUMNS = 'player_id, name, overall, auction_group (GK/DEF/MID/ATT) or position; optional club, nationality, age, preferred_foot, image_url, pace, shooting, passing, dribbling, defending, physical, secondary_positions, league, rating_tier';
const DEFAULT_GROUPS = new Set(['GK', 'DEF', 'MID', 'ATT']);
const DEFAULT_POT_BY_FC26: Record<string, string> = { GK: 'GK', CB: 'DEF', FB: 'DEF', MID: 'MID', ATT: 'ATT' };

/** Reduce a client-supplied name to a harmless display label. It is never used as a path. */
export function sanitizeFileName(name: string | undefined): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[^\w .()\-]/g, '').trim().slice(0, POOL_IMPORT_LIMITS.maxFileName);
  return clean || 'upload.csv';
}
/** The server owns the price: it is recomputed from rating and draft pool for the room's source. Client prices are ignored. */
export function priceUnits(player: { ovr: number; draftPool?: DraftPool | undefined }, ctx: PricingContext): number {
  const units = ctx.roomSource === 'FC26'
    ? fc26BasePriceUnits({ overall: player.ovr, draftPool: player.draftPool ?? 'REGULAR' }, ctx.topRatingThreshold)
    : toUnits(defaultPoolBasePriceCr(player.ovr));
  return Math.max(units, ctx.minimumBasePriceUnits);
}
const isUnderdogRow = (row: Record<string, string>): boolean =>
  (row.draft_pool ?? '').trim().toUpperCase() === 'UNDERDOG' || (row.underdog_tag ?? '').trim() !== '';
const cleanStats = (stats: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(stats).filter(([, v]) => Number.isFinite(v) && v >= 0 && v <= 100));

/** Make an already built player valid for the room's source: category vocabulary and server-computed price. */
export function fitToRoom(player: Player, ctx: PricingContext): Player {
  let potId = player.potId;
  if (ctx.roomSource === 'DEFAULT' && DEFAULT_POT_BY_FC26[potId]) potId = DEFAULT_POT_BY_FC26[potId]!;
  const position: Player['position'] = ctx.roomSource === 'DEFAULT' && potId === 'ATT' ? 'FWD' : player.position;
  const next: Player = { ...player, potId, position, stats: cleanStats(player.stats) };
  next.basePriceUnits = priceUnits(next, ctx);
  return next;
}
const idText = (value: string | undefined): string => (value ?? '').trim();

function fc26Row(row: Record<string, string>, index: number, ctx: PricingContext): PoolCandidate {
  const playerId = idText(row.player_id);
  const name = idText(row.short_name) || idText(row.long_name);
  const reject = (reason: string): PoolCandidate => ({ row: index + 2, playerId, name,
    error: { row: index + 2, playerId, name, code: 'INVALID', reason } });
  const parsed = fc26RowSchema.safeParse(row);
  if (!parsed.success) return reject(parsed.error.issues[0]?.message ?? 'Invalid row.');
  const positions = [...new Set(parsed.data.player_positions.split(/[,;]/).map(p => p.trim().toUpperCase()).filter(isKnownPosition))];
  if (positions.length === 0) return reject('No recognised position in player_positions.');
  const underdog = isUnderdogRow(row);
  const source = underdog ? 'UNDERDOG' as const : potForPosition(positions[0]!);
  const { player } = fc26RecordFromEntry({ source, fileName: 'upload', row, positions, overall: parsed.data.overall, id: parsed.data.player_id },
    [source], ctx.topRatingThreshold);
  return { row: index + 2, playerId, name: player.name, player: fitToRoom(player, ctx) };
}

function defaultRow(row: Record<string, string>, index: number, ctx: PricingContext): PoolCandidate {
  const playerId = idText(row.player_id);
  const name = idText(row.name);
  const reject = (reason: string): PoolCandidate => ({ row: index + 2, playerId, name,
    error: { row: index + 2, playerId, name, code: 'INVALID', reason } });
  if (!playerId) return reject('player_id is required.');
  if (playerId.length > 100 || /[\u0000-\u001f]/.test(playerId)) return reject('player_id is invalid.');
  if (!name) return reject('name is required.');
  if (name.length > 100) return reject('name is too long.');
  if (!/^\d{1,2}$/.test(idText(row.overall)) || Number(row.overall) < 1) return reject('overall must be a whole number from 1 to 99.');
  const group = (row.auction_group || row.position || '').trim().toUpperCase();
  const position = (row.position ?? '').trim().toUpperCase();
  let pot: string | undefined;
  if (ctx.roomSource === 'FC26') {
    // FC26 rooms classify by the specific position; a broad group alone is not enough.
    if (isKnownPosition(position)) pot = potForPosition(position);
    else if (isKnownPosition(group)) pot = potForPosition(group);
  } else if (DEFAULT_GROUPS.has(group)) pot = group;
  else if (isKnownPosition(group)) pot = DEFAULT_POT_BY_FC26[potForPosition(group)];
  if (!pot) return reject('Cannot classify position.');
  const underdog = isUnderdogRow(row);
  const base = csvRowToPlayer({ ...row, auction_group: pot, base_price_cr: '' });
  const known = isKnownPosition(position) ? position : isKnownPosition(group) ? group : undefined;
  const player: Player = { ...base, id: playerId, name, potId: pot,
    ...(ctx.roomSource === 'FC26' && known ? { position: broadPosition(known), positions: [known], subPosition: known } : {}),
    ...(underdog ? { draftPool: 'UNDERDOG' as const, playerTag: 'UNDERDOG' as const, sourceCategory: 'UNDERDOG' } : { draftPool: 'REGULAR' as const, sourceCategory: pot }) };
  return { row: index + 2, playerId, name, player: fitToRoom(player, ctx) };
}

/** Parse an uploaded CSV. Whole-file problems throw 400; row problems become per-row rejections. */
export function csvCandidates(csv: string | undefined, ctx: PricingContext): PoolCandidate[] {
  requireThat(typeof csv === 'string' && csv.trim().length > 0, 'EMPTY_FILE', 'The CSV is empty.');
  requireThat(csv.length <= POOL_IMPORT_LIMITS.maxCsvChars, 'FILE_TOO_LARGE', `The CSV is larger than ${POOL_IMPORT_LIMITS.maxCsvChars} characters.`, 413);
  let records: Record<string, string>[];
  try { records = parseCsv(csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv); }
  catch { requireThat(false, 'INVALID_CSV', 'The file is not valid CSV.'); }
  requireThat(records.length > 0, 'EMPTY_FILE', 'The CSV has no data rows.');
  requireThat(records.length <= POOL_IMPORT_LIMITS.maxRows, 'TOO_MANY_ROWS', `The CSV has more than ${POOL_IMPORT_LIMITS.maxRows} rows.`);
  const headers = Object.keys(records[0]!);
  const fc26 = headers.includes('player_positions');
  const missing = fc26
    ? ['player_id', 'player_positions', 'overall'].filter(h => !headers.includes(h)).concat(headers.includes('short_name') || headers.includes('long_name') ? [] : ['short_name'])
    : ['player_id', 'name', 'overall'].filter(h => !headers.includes(h)).concat(headers.includes('auction_group') || headers.includes('position') ? [] : ['auction_group']);
  requireThat(missing.length === 0, 'MISSING_COLUMNS', `Missing required columns: ${missing.join(', ')}. Accepted columns: ${fc26 ? FC26_COLUMNS : DEFAULT_COLUMNS}.`, 400,
    { acceptedColumns: { fc26: FC26_COLUMNS, default: DEFAULT_COLUMNS } });
  return records.map((row, index) => fc26 ? fc26Row(row, index, ctx) : defaultRow(row, index, ctx));
}

/** Players that already come from a server catalog; only room fitting and pricing are applied. */
export function playerCandidates(players: readonly Player[], ctx: PricingContext): PoolCandidate[] {
  requireThat(players.length <= POOL_IMPORT_LIMITS.maxRows, 'TOO_MANY_ROWS', `More than ${POOL_IMPORT_LIMITS.maxRows} players selected.`);
  return players.map((p, index) => ({ row: index + 1, playerId: p.id, name: p.name, player: fitToRoom(p, ctx) }));
}

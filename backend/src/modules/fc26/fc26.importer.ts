import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { Player } from '../../domain/types.js';
import { fc26BasePriceUnits, type DraftPool } from '../../domain/pricing.js';
import { parseCsv } from '../players/player.service.js';
import { FC26_SOURCE_PRIORITY, type Fc26Config, type Fc26SourceCategory } from './fc26.config.js';
import { assignPot, broadPosition, isKnownPosition } from './fc26.positions.js';

export interface Fc26Record { player: Player; metadata: Record<string, unknown> }
export interface Fc26InvalidRow { file: string; row: number; reason: string }
export type Fc26FileStatus = 'READ' | 'MISSING' | 'UNREADABLE' | 'INVALID';
export interface Fc26FileReport {
  source: Fc26SourceCategory; file: string; status: Fc26FileStatus; message?: string;
  rows: number; valid: number; invalid: number; imported: number; skippedDuplicates: number;
}
export interface Fc26ImportReport {
  filesRead: number; missingFiles: string[]; rowsRead: number; imported: number; skippedDuplicates: number;
  invalidRows: Fc26InvalidRow[]; perFile: Record<Fc26SourceCategory, Fc26FileReport>; underdogImported: number;
}
export interface ParsedEntry { source: Fc26SourceCategory; fileName: string; row: Record<string, string>; positions: string[]; overall: number; id: string }
export interface Fc26ReadResult { entries: ParsedEntry[]; files: Fc26FileReport[]; missingFiles: string[]; invalidRows: Fc26InvalidRow[]; rowsRead: number }

const REQUIRED_HEADERS = ['player_id', 'player_positions', 'overall'];
const MAX_FILE_BYTES = 25_000_000;
export const fc26RowSchema = z.object({
  player_id: z.string().regex(/^\d{1,12}$/, 'player_id must be numeric'),
  short_name: z.string().max(100).optional(),
  long_name: z.string().max(200).optional(),
  overall: z.coerce.number().int().min(1).max(99),
  player_positions: z.string().min(1, 'player_positions is required'),
}).refine(r => Boolean(r.short_name?.trim() || r.long_name?.trim()), { message: 'short_name is required' });
const num = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};
const stat = (value: string | undefined): number | undefined => { const n = num(value); return n !== undefined && n >= 0 && n <= 100 ? n : undefined; };
const ATTRIBUTE_PREFIX = /^(attacking|skill|movement|power|mentality|defending|goalkeeping)_/;
const POSITION_RATING_COLUMNS = new Set(['ls', 'st', 'rs', 'lw', 'lf', 'cf', 'rf', 'rw', 'lam', 'cam', 'ram', 'lm', 'lcm', 'cm', 'rcm', 'rm',
  'lwb', 'ldm', 'cdm', 'rdm', 'rwb', 'lb', 'lcb', 'cb', 'rcb', 'rb', 'gk']);
const MAPPED_COLUMNS = new Set(['player_id', 'short_name', 'long_name', 'player_positions', 'overall', 'potential', 'nationality_name', 'club_name',
  'league_name', 'age', 'preferred_foot', 'pace', 'shooting', 'passing', 'dribbling', 'defending', 'physic', 'player_face_url',
  'draft_pool', 'underdog_tag', 'underdog_reason', 'underdog_position_group']);

/** Read every configured file. Missing, unreadable or malformed files are reported, never thrown. */
export async function readFc26Files(config: Fc26Config, read: (path: string) => Promise<string> = p => readFile(p, 'utf8')): Promise<Fc26ReadResult> {
  const result: Fc26ReadResult = { entries: [], files: [], missingFiles: [], invalidRows: [], rowsRead: 0 };
  for (const file of config.files) {
    const report: Fc26FileReport = { source: file.source, file: file.name, status: 'READ', rows: 0, valid: 0, invalid: 0, imported: 0, skippedDuplicates: 0 };
    result.files.push(report);
    let text: string;
    try { text = await read(file.path); }
    catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
      report.status = missing ? 'MISSING' : 'UNREADABLE';
      report.message = missing ? 'File not found.' : 'File could not be read.';
      if (missing) result.missingFiles.push(file.name);
      continue;
    }
    if (text.length > MAX_FILE_BYTES) { report.status = 'INVALID'; report.message = 'File is too large.'; continue; }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    let records: Record<string, string>[];
    try { records = parseCsv(text); } catch { report.status = 'INVALID'; report.message = 'File is not valid CSV.'; continue; }
    if (records.length === 0) { report.status = 'INVALID'; report.message = 'File has no data rows.'; continue; }
    const missingHeaders = REQUIRED_HEADERS.filter(h => !(h in records[0]!));
    if (missingHeaders.length) { report.status = 'INVALID'; report.message = 'Missing required columns: ' + missingHeaders.join(', ') + '.'; continue; }
    records.forEach((row, index) => {
      report.rows++; result.rowsRead++;
      const invalid = (reason: string) => { report.invalid++; result.invalidRows.push({ file: file.name, row: index + 2, reason }); };
      const parsed = fc26RowSchema.safeParse(row);
      if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Invalid row.');
      const positions = parsed.data.player_positions.split(/[,;]/).map(p => p.trim().toUpperCase()).filter(isKnownPosition);
      if (positions.length === 0) return invalid('No recognised position in player_positions.');
      report.valid++;
      result.entries.push({ source: file.source, fileName: file.name, row, positions: [...new Set(positions)], overall: parsed.data.overall, id: parsed.data.player_id });
    });
  }
  return result;
}

export function fc26RecordFromEntry(winner: ParsedEntry, sources: Fc26SourceCategory[], threshold: number): Fc26Record {
  const { row } = winner;
  const { pot, sourceCategory } = assignPot(winner.positions[0]!, sources);
  const draftPool: DraftPool = sourceCategory === 'UNDERDOG' ? 'UNDERDOG' : 'REGULAR';
  const stats: Record<string, number> = {};
  for (const [short, long, column] of [['pac', 'pace', 'pace'], ['sho', 'shooting', 'shooting'], ['pas', 'passing', 'passing'],
    ['dri', 'dribbling', 'dribbling'], ['def', 'defending', 'defending'], ['phy', 'physical', 'physic']] as const) {
    const value = stat(row[column]);
    if (value !== undefined) { stats[short] = value; stats[long] = value; }
  }
  const attributes: Record<string, number> = {}; const positionRatings: Record<string, string> = {}; const extra: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === '' || MAPPED_COLUMNS.has(key)) continue;
    if (POSITION_RATING_COLUMNS.has(key)) positionRatings[key] = value;
    else if (ATTRIBUTE_PREFIX.test(key) && num(value) !== undefined) attributes[key] = Number(value);
    else extra[key] = value;
  }
  const age = num(row.age); const potential = num(row.potential);
  const image = row.player_face_url?.trim();
  const secondary = winner.positions.slice(1);
  const player: Player = {
    id: winner.id, externalId: winner.id, name: row.short_name?.trim() || row.long_name!.trim(), position: broadPosition(winner.positions[0]!), ovr: winner.overall,
    stats, basePriceUnits: fc26BasePriceUnits({ overall: winner.overall, draftPool }, threshold), potId: pot,
    positions: winner.positions, subPosition: winner.positions[0], draftPool, sourceCategory, sourceCategories: sources,
    ...(row.long_name ? { fullName: row.long_name } : {}),
    ...(secondary.length ? { secondaryPositions: secondary.join(', ') } : {}),
    ...(potential !== undefined && potential >= 1 && potential <= 99 ? { potential: Math.round(potential) } : {}),
    ...(row.club_name ? { club: row.club_name } : {}), ...(row.nationality_name ? { nationality: row.nationality_name } : {}),
    ...(row.league_name ? { league: row.league_name } : {}),
    ...(age !== undefined && age >= 14 && age <= 60 ? { age: Math.round(age) } : {}),
    ...(row.preferred_foot ? { preferredFoot: row.preferred_foot } : {}),
    ...(image && /^https?:\/\//i.test(image) ? { photoUrl: image } : {}),
    ...(draftPool === 'UNDERDOG' ? { playerTag: 'UNDERDOG' as const } : {}),
  };
  const underdogEntry = row.underdog_reason || row.underdog_position_group
    ? { underdog: { reason: row.underdog_reason || null, positionGroup: row.underdog_position_group || null } } : {};
  return { player, metadata: { fc26: { attributes, positionRatings, extra, ...underdogEntry } } };
}

/** Deduplicate by player_id across and within files. Underdog wins; otherwise the D4 pot rule applies. */
export function buildFc26Records(entries: readonly ParsedEntry[], threshold: number): Fc26Record[] {
  const byId = new Map<string, ParsedEntry[]>();
  for (const entry of entries) { const list = byId.get(entry.id); if (list) list.push(entry); else byId.set(entry.id, [entry]); }
  const rank = (s: Fc26SourceCategory) => FC26_SOURCE_PRIORITY.indexOf(s);
  return [...byId.values()].map(list => {
    const sources = [...new Set(list.map(e => e.source))].sort((a, b) => rank(a) - rank(b));
    const underdog = list.find(e => e.source === 'UNDERDOG');
    const natural = assignPot(list[0]!.positions[0]!, sources).sourceCategory;
    const winner = underdog ?? list.find(e => e.source === natural) ?? [...list].sort((a, b) => rank(a.source) - rank(b.source))[0]!;
    return fc26RecordFromEntry(winner, sources, threshold);
  });
}

/** Combine the parse result and the set of ids that were actually stored into the public report. */
export function buildFc26Report(read: Fc26ReadResult, records: readonly Fc26Record[], importedIds: ReadonlySet<string>): Fc26ImportReport {
  const perFile = Object.fromEntries(read.files.map(f => [f.source, { ...f }])) as Record<Fc26SourceCategory, Fc26FileReport>;
  let underdogImported = 0;
  for (const record of records) {
    if (!importedIds.has(record.player.id)) continue;
    perFile[record.player.sourceCategory as Fc26SourceCategory].imported++;
    if (record.player.draftPool === 'UNDERDOG') underdogImported++;
  }
  for (const file of Object.values(perFile)) file.skippedDuplicates = file.valid - file.imported;
  const valid = read.entries.length;
  return { filesRead: read.files.filter(f => f.status === 'READ').length, missingFiles: read.missingFiles, rowsRead: read.rowsRead,
    imported: importedIds.size, skippedDuplicates: valid - importedIds.size, invalidRows: read.invalidRows, perFile, underdogImported };
}

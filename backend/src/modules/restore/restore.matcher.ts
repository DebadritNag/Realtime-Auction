import { createHash } from 'node:crypto';
import type { Player } from '../../domain/types.js';
import { toUnits } from '../../domain/money.js';
import { broadPosition, potForPosition } from '../fc26/fc26.positions.js';
import type { CandidateSummary, MatchResult, RestoreSource } from './restore.types.js';
import type { RestorePlayerInput } from './restore.schema.js';
const SPECIAL: Record<string, string> = { 'ø': 'o', 'ß': 'ss', 'ı': 'i', 'æ': 'ae', 'œ': 'oe', 'đ': 'd', 'ł': 'l', 'þ': 'th', 'ð': 'd' };
/** Accent-insensitive, case-insensitive, punctuation-insensitive comparison key. */
export function normalizeName(name: string): string {
  const lower = name.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
  return Array.from(lower, ch => SPECIAL[ch] ?? ch).join('').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
/** Stable id of a restored-only player; the same name and position always give the same id. */
export function manualPlayerId(name: string, position: string): string {
  return 'manual-' + createHash('sha1').update(`${normalizeName(name)}|${position.toUpperCase()}`).digest('hex').slice(0, 12);
}
export const MANUAL_DEFAULT_OVR = 60;
export function buildManualPlayer(entry: Pick<RestorePlayerInput, 'name' | 'position' | 'underdog' | 'manual'>): Player {
  const position = entry.position.toUpperCase();
  const underdog = entry.underdog === true;
  return { id: manualPlayerId(entry.name, position), name: entry.name.trim(), position: broadPosition(position), ovr: entry.manual?.ovr ?? MANUAL_DEFAULT_OVR,
    stats: {}, basePriceUnits: toUnits(1), potId: potForPosition(position), subPosition: position, positions: [position],
    draftPool: underdog ? 'UNDERDOG' : 'REGULAR', ...(underdog ? { playerTag: 'UNDERDOG' as const } : {}) };
}
interface Entry { player: Player; source: RestoreSource; short: string; long: string }
export interface MatchIndex { entries: Entry[]; byId: Map<string, Entry> }
const positionsOf = (p: Player): string[] => (p.positions?.length ? p.positions : [p.subPosition ?? p.position]).map(x => x.toUpperCase());
export function buildMatchIndex(fc26Players: Player[], defaultPool: Player[] = []): MatchIndex {
  const entries: Entry[] = [];
  const byId = new Map<string, Entry>();
  const add = (players: Player[], source: RestoreSource) => {
    for (const player of players) {
      // The catalog wins when the same id exists in both sources.
      if (!player.id || byId.has(player.id)) continue;
      const entry: Entry = { player, source, short: normalizeName(player.name), long: normalizeName(player.fullName ?? '') };
      entries.push(entry); byId.set(player.id, entry);
    }
  };
  add(fc26Players, 'FC26');
  add(defaultPool, 'DEFAULT_POOL');
  return { entries, byId };
}
export const summarize = (e: Entry): CandidateSummary => ({ playerId: e.player.id, name: e.player.name, ...(e.player.fullName ? { fullName: e.player.fullName } : {}),
  position: e.player.subPosition ?? e.player.position, positions: positionsOf(e.player), ...(e.player.club ? { club: e.player.club } : {}), ovr: e.player.ovr,
  underdog: e.player.draftPool === 'UNDERDOG', ...(e.player.photoUrl ? { photoUrl: e.player.photoUrl } : {}), source: e.source });
const matched = (e: Entry): MatchResult => ({ kind: e.source === 'FC26' ? 'MATCHED_FC26' : 'MATCHED_DEFAULT_POOL', source: e.source, player: e.player });
function suggestions(index: MatchIndex, normalized: string): CandidateSummary[] {
  const surname = normalized.split(' ').filter(t => t.length > 1).pop() ?? normalized;
  if (!surname) return [];
  return index.entries.filter(e => e.short.includes(surname) || e.long.includes(surname)).sort((a, b) => b.player.ovr - a.player.ovr).slice(0, 5).map(summarize);
}
/**
 * Match order: exact short_name, then long_name, FC26 before the default pool. Several hits are narrowed by position,
 * then by the underdog flag. Anything still ambiguous or unknown needs the host.
 */
export function matchPlayer(index: MatchIndex, entry: RestorePlayerInput): MatchResult {
  if (entry.playerId) {
    const found = index.byId.get(entry.playerId);
    if (found) return { kind: 'RESOLVED', source: found.source, player: found.player };
    if (entry.manual && entry.playerId === manualPlayerId(entry.name, entry.position)) return { kind: 'MANUAL', source: 'MANUAL', player: buildManualPlayer(entry) };
    return { kind: 'UNMATCHED', suggestions: suggestions(index, normalizeName(entry.name)) };
  }
  if (entry.manual) return { kind: 'MANUAL', source: 'MANUAL', player: buildManualPlayer(entry) };
  const normalized = normalizeName(entry.name);
  const position = entry.position.toUpperCase();
  for (const source of ['FC26', 'DEFAULT_POOL'] as const) {
    for (const field of ['short', 'long'] as const) {
      let hits = index.entries.filter(e => e.source === source && normalized !== '' && e[field] === normalized);
      if (hits.length === 0) continue;
      if (hits.length > 1) {
        const byPosition = hits.filter(e => positionsOf(e.player).includes(position));
        if (byPosition.length > 0) hits = byPosition;
      }
      if (hits.length > 1 && entry.underdog !== undefined) {
        const byTag = hits.filter(e => (e.player.draftPool === 'UNDERDOG') === entry.underdog);
        if (byTag.length > 0) hits = byTag;
      }
      return hits.length === 1 ? matched(hits[0]!) : { kind: 'AMBIGUOUS', candidates: hits.slice(0, 10).map(summarize) };
    }
  }
  return { kind: 'UNMATCHED', suggestions: suggestions(index, normalized) };
}

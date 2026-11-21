import type { Fc26SourceCategory } from './fc26.config.js';
import { FC26_SOURCE_PRIORITY } from './fc26.config.js';
export type Fc26Pot = Exclude<Fc26SourceCategory, 'UNDERDOG'>;
export const FC26_POTS: readonly Fc26Pot[] = ['GK', 'CB', 'FB', 'MID', 'ATT'];
export const FC26_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'LF', 'RF', 'ST', 'CF'] as const;
const POSITION_SET = new Set<string>(FC26_POSITIONS);
export const isKnownPosition = (position: string): boolean => POSITION_SET.has(position);
export type BroadPosition = 'GK' | 'DEF' | 'MID' | 'FWD';
const POT_BY_POSITION: Record<string, Fc26Pot> = {
  GK: 'GK', CB: 'CB', LB: 'FB', RB: 'FB', LWB: 'FB', RWB: 'FB',
  CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'ATT', RW: 'ATT', LF: 'ATT', RF: 'ATT', ST: 'ATT', CF: 'ATT',
};
/** Pot implied by a single position. */
export const potForPosition = (position: string): Fc26Pot => POT_BY_POSITION[position] ?? 'ATT';
/** Broad category used by squad statistics and formations (unchanged semantics: GK/DEF/MID/FWD). */
export function broadPosition(position: string): BroadPosition {
  const pot = potForPosition(position);
  return pot === 'GK' ? 'GK' : pot === 'CB' || pot === 'FB' ? 'DEF' : pot === 'MID' ? 'MID' : 'FWD';
}
/**
 * Pot assignment (plan D4).
 * - Underdog: always the pot of the primary position.
 * - Regular: the pot of the file it came from; when it appears in several files, the file matching the
 *   primary-position pot if present, otherwise the first file by priority.
 */
export function assignPot(primaryPosition: string, sources: readonly Fc26SourceCategory[]): { pot: Fc26Pot; sourceCategory: Fc26SourceCategory } {
  const natural = potForPosition(primaryPosition);
  if (sources.includes('UNDERDOG')) return { pot: natural, sourceCategory: 'UNDERDOG' };
  const regular = FC26_SOURCE_PRIORITY.filter((s): s is Fc26Pot => s !== 'UNDERDOG' && sources.includes(s));
  const chosen = regular.includes(natural) ? natural : regular[0] ?? natural;
  return { pot: chosen, sourceCategory: chosen };
}
export type PositionGroup = 'ALL' | 'GK' | 'CB' | 'FB' | 'CM' | 'WM' | 'ST' | 'W';
export const POSITION_GROUPS: Record<Exclude<PositionGroup, 'ALL'>, readonly string[]> = {
  GK: ['GK'], CB: ['CB'], FB: ['LB', 'RB', 'LWB', 'RWB'], CM: ['CDM', 'CM', 'CAM'], WM: ['LM', 'RM'], ST: ['ST', 'CF'], W: ['LW', 'RW', 'LF', 'RF'],
};
/** A player matches a group when ANY eligible position is in it. */
export function matchesPositionGroup(positions: readonly string[], group: PositionGroup): boolean {
  return group === 'ALL' || positions.some(p => POSITION_GROUPS[group].includes(p));
}

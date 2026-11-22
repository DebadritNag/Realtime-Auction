import { createHash } from 'node:crypto';
import type { Player } from '../../domain/types.js';
import { isKnownPosition } from '../fc26/fc26.positions.js';
import { buildMatchIndex, matchPlayer, type MatchIndex } from './restore.matcher.js';
import type { RestoreSnapshot } from './restore.schema.js';
import { MAX_RETAINED_PER_TEAM, MAX_SQUAD_SIZE, type MatchResult, type PreviewPlayer, type PreviewTeam, type RestoreIssue, type RestorePreview } from './restore.types.js';
export interface RestoreCatalogs { fc26Players: Player[]; defaultPool: Player[] }
export interface ValidatedTeam { name: string; purseCr: number; players: { input: RestoreSnapshot['teams'][number]['players'][number]; match: MatchResult }[] }
export interface ValidationResult { preview: RestorePreview; teams: ValidatedTeam[]; index: MatchIndex }
/** Canonical hash of the snapshot as supplied (after schema parsing), used to recognise shipped templates and for the audit record. */
export const snapshotHash = (snapshot: RestoreSnapshot): string => createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
const hasPosition = (player: Player, position: string): boolean =>
  (player.positions?.length ? player.positions : [player.subPosition ?? player.position]).some(p => p.toUpperCase() === position.toUpperCase());
/** Pure validation of a snapshot against the catalogs. Never throws for data problems; they become issues. */
export function validateSnapshot(snapshot: RestoreSnapshot, catalogs: RestoreCatalogs): ValidationResult {
  const index = buildMatchIndex(catalogs.fc26Players, catalogs.defaultPool);
  const issues: RestoreIssue[] = [];
  const add = (issue: RestoreIssue) => { issues.push(issue); return issue; };
  const seenTeamNames = new Map<string, string>();
  const owner = new Map<string, { team: string; player: string }>();
  const fc26Ids = new Set(catalogs.fc26Players.map(p => p.id));
  const teams: ValidatedTeam[] = [];
  const previewTeams: PreviewTeam[] = [];
  const totals = { teams: snapshot.teams.length, players: 0, retained: 0, auction: 0, matchedFc26: 0, matchedDefaultPool: 0, manual: 0, unresolved: 0 };
  for (const team of snapshot.teams) {
    const key = team.name.trim().toLowerCase();
    if (seenTeamNames.has(key)) add({ severity: 'CRITICAL', code: 'DUPLICATE_TEAM_NAME', teamName: team.name, message: `Team name "${team.name}" is used more than once.` });
    seenTeamNames.set(key, team.name);
    if (team.verify) add({ severity: 'WARNING', code: 'TEAM_VERIFY', teamName: team.name, message: team.verify });
    const retained = team.players.filter(p => p.acquisition === 'RETENTION').length;
    const auction = team.players.length - retained;
    if (team.squadSize !== team.players.length) add({ severity: 'CRITICAL', code: 'SQUAD_COUNT_MISMATCH', teamName: team.name,
      message: `${team.name}: squad size ${team.squadSize} does not match the ${team.players.length} players listed.` });
    if (team.squadSize > MAX_SQUAD_SIZE || team.players.length > MAX_SQUAD_SIZE) add({ severity: 'CRITICAL', code: 'SQUAD_TOO_LARGE', teamName: team.name,
      message: `${team.name}: a squad cannot exceed ${MAX_SQUAD_SIZE} players.` });
    if (team.retainedCount !== retained) add({ severity: 'CRITICAL', code: 'RETAINED_COUNT_MISMATCH', teamName: team.name,
      message: `${team.name}: retained count ${team.retainedCount} does not match the ${retained} retained players listed.` });
    if (team.auctionCount !== undefined && team.auctionCount !== auction) add({ severity: 'CRITICAL', code: 'AUCTION_COUNT_MISMATCH', teamName: team.name,
      message: `${team.name}: auction-acquired count ${team.auctionCount} does not match the ${auction} auction players listed.` });
    if (retained > MAX_RETAINED_PER_TEAM) add({ severity: 'WARNING', code: 'RETAINED_ABOVE_LIMIT', teamName: team.name,
      message: `${team.name}: ${retained} retained players exceeds the usual limit of ${MAX_RETAINED_PER_TEAM}.` });
    const previewPlayers: PreviewPlayer[] = [];
    const validatedPlayers: ValidatedTeam['players'] = [];
    for (const input of team.players) {
      const mark = issues.length;
      const match = matchPlayer(index, input);
      const here = (severity: RestoreIssue['severity'], code: string, message: string) => add({ severity, code, teamName: team.name, playerName: input.name, message });
      if (!isKnownPosition(input.position.toUpperCase())) here('CRITICAL', 'INVALID_POSITION', `${input.name}: "${input.position}" is not a known position.`);
      if (match.kind === 'AMBIGUOUS') here('CRITICAL', 'PLAYER_AMBIGUOUS', `${input.name}: several catalog players match. Pick the right one.`);
      else if (match.kind === 'UNMATCHED') here('CRITICAL', 'PLAYER_UNMATCHED', `${input.name}: no catalog player found. Search for the player or create a manual record.`);
      const player = match.player;
      if (player) {
        const previous = owner.get(player.id);
        if (previous) here('CRITICAL', 'DUPLICATE_PLAYER', `${input.name} is listed for both ${previous.team} and ${team.name}${previous.team === team.name ? ' (twice)' : ''}.`);
        else owner.set(player.id, { team: team.name, player: input.name });
        if (match.kind !== 'MANUAL' && !hasPosition(player, input.position)) here('WARNING', 'POSITION_MISMATCH',
          `${input.name}: listed as ${input.position}, the database has ${(player.positions ?? [player.subPosition ?? player.position]).join('/')}.`);
        if (match.kind !== 'MANUAL' && input.underdog !== undefined && (player.draftPool === 'UNDERDOG') !== input.underdog) here('WARNING', 'UNDERDOG_MISMATCH',
          `${input.name}: ${input.underdog ? 'marked' : 'not marked'} UNDERDOG in the snapshot but ${player.draftPool === 'UNDERDOG' ? 'is' : 'is not'} in the database.`);
        if (match.kind === 'MANUAL') here('WARNING', 'MANUAL_PLAYER', `${input.name}: restored-only player (rating ${player.ovr}); it is not in the player database.`);
        if (match.source === 'DEFAULT_POOL') here('WARNING', 'DEFAULT_POOL_MATCH', `${input.name}: matched in the default player pool, not the FC26 database.`);
      }
      if (input.verify) here('WARNING', 'VERIFY_ENTRY', `${input.name}: flagged for host verification.`);
      totals.players++;
      if (input.acquisition === 'RETENTION') totals.retained++; else totals.auction++;
      if (match.kind === 'MATCHED_FC26' || (match.kind === 'RESOLVED' && match.source === 'FC26')) totals.matchedFc26++;
      else if (match.kind === 'MATCHED_DEFAULT_POOL' || (match.kind === 'RESOLVED' && match.source === 'DEFAULT_POOL')) totals.matchedDefaultPool++;
      else if (match.kind === 'MANUAL') totals.manual++;
      else totals.unresolved++;
      previewPlayers.push({ name: input.name, position: input.position, acquisition: input.acquisition, underdog: input.underdog ?? player?.draftPool === 'UNDERDOG', verify: input.verify === true,
        match: { kind: match.kind, ...(player ? { playerId: player.id, matchedName: player.name, ...(player.fullName ? { fullName: player.fullName } : {}),
          ...(player.club ? { club: player.club } : {}), ovr: player.ovr, ...(player.photoUrl ? { photoUrl: player.photoUrl } : {}),
          positions: player.positions ?? [player.subPosition ?? player.position] } : {}),
          ...(match.source ? { source: match.source } : {}), ...(match.candidates ? { candidates: match.candidates } : {}), ...(match.suggestions ? { suggestions: match.suggestions } : {}) },
        issues: issues.slice(mark) });
      validatedPlayers.push({ input, match });
    }
    teams.push({ name: team.name, purseCr: team.remainingPurseCr, players: validatedPlayers });
    previewTeams.push({ name: team.name, squadSize: team.squadSize, actualPlayers: team.players.length, remainingSlots: Math.max(0, MAX_SQUAD_SIZE - team.squadSize),
      remainingPurseCr: team.remainingPurseCr, retainedCount: retained, auctionCount: auction, ...(team.verify ? { verify: team.verify } : {}), players: previewPlayers });
  }
  const ownedCatalogIds = [...owner.keys()].filter(id => fc26Ids.has(id));
  const byPot: Record<string, number> = {};
  const taken = new Set(ownedCatalogIds);
  for (const p of catalogs.fc26Players) if (!taken.has(p.id)) byPot[p.potId] = (byPot[p.potId] ?? 0) + 1;
  const poolTotal = catalogs.fc26Players.length - ownedCatalogIds.length;
  if (poolTotal < 1) add({ severity: 'CRITICAL', code: 'EMPTY_PLAYER_POOL', message: 'No players would remain to auction.' });
  const preview: RestorePreview = { name: snapshot.name, teams: previewTeams, issues, totals, remainingPool: { total: poolTotal, byPot },
    canConfirm: !issues.some(i => i.severity === 'CRITICAL') };
  return { preview, teams, index };
}

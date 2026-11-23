import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import type { Player } from '../../domain/types.js';
import { DomainError } from '../../domain/errors.js';
import { fc26BasePriceUnits, type DraftPool } from '../../domain/pricing.js';
import type { Fc26Config } from './fc26.config.js';
import { buildFc26Records, buildFc26Report, readFc26Files, type Fc26ImportReport, type Fc26Record } from './fc26.importer.js';
import { broadPosition, matchesPositionGroup, type Fc26Pot, type PositionGroup } from './fc26.positions.js';

export interface Fc26SearchQuery { query?: string; group?: PositionGroup; potId?: string; offset?: number; limit?: number; excludeIds?: Iterable<string> }
export interface Fc26SearchResult { total: number; players: Player[] }
export interface Fc26Stats { total: number; underdogs: number; byPot: Record<string, number> }
export interface Fc26Catalog {
  /** Rating threshold used to price regular players; consumers recompute prices with it. */
  readonly topRatingThreshold: number;
  importAll(): Promise<Fc26ImportReport>;
  /** Drops the cache when it is older than maxAgeMs so rows added to the database since the last load become visible. */
  refresh(maxAgeMs?: number): Promise<void>;
  list(): Promise<Player[]>;
  get(id: string): Promise<Player | null>;
  search(query: Fc26SearchQuery): Promise<Fc26SearchResult>;
  stats(): Promise<Fc26Stats>;
  lastReport(): Fc26ImportReport | null;
}
const haystack = (p: Player): string => [p.name, p.fullName, p.club, p.nationality, p.id, p.league, ...(p.positions ?? [])]
  .filter(Boolean).join(' ').toLowerCase();

/** Shared cache, search and statistics. Subclasses only know how to store and load players. */
abstract class IndexedFc26Catalog implements Fc26Catalog {
  private cache: { players: Player[]; byId: Map<string, Player>; index: Map<string, string> } | null = null;
  private report: Fc26ImportReport | null = null;
  constructor(protected readonly config: Fc26Config, protected readonly readFile?: (path: string) => Promise<string>) {}
  get topRatingThreshold(): number { return this.config.topRatingThreshold; }
  /** Persist records not stored yet and return the ids that were newly stored. */
  protected abstract persist(records: Fc26Record[]): Promise<Set<string>>;
  protected abstract load(): Promise<Player[]>;
  private loadedAt = 0;
  protected invalidate(): void { this.cache = null; }
  async refresh(maxAgeMs = 10_000): Promise<void> {
    if (this.cache && Date.now() - this.loadedAt >= maxAgeMs) this.invalidate();
  }
  /** Prices are always recomputed from rating and draft pool; stored values are never trusted. */
  private normalize(player: Player): Player {
    const draftPool: DraftPool = player.draftPool === 'UNDERDOG' ? 'UNDERDOG' : 'REGULAR';
    return { ...player, draftPool, basePriceUnits: fc26BasePriceUnits({ overall: player.ovr, draftPool }, this.config.topRatingThreshold) };
  }
  private async ensure() {
    if (this.cache) return this.cache;
    const players = (await this.load()).map(p => this.normalize(p)).sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name));
    this.cache = { players, byId: new Map(players.map(p => [p.id, p])), index: new Map(players.map(p => [p.id, haystack(p)])) };
    this.loadedAt = Date.now();
    return this.cache;
  }
  async importAll(): Promise<Fc26ImportReport> {
    const read = await readFc26Files(this.config, this.readFile);
    const records = buildFc26Records(read.entries, this.config.topRatingThreshold);
    const stored = records.length ? await this.persist(records) : new Set<string>();
    this.invalidate();
    this.report = buildFc26Report(read, records, stored);
    return structuredClone(this.report);
  }
  lastReport(): Fc26ImportReport | null { return this.report ? structuredClone(this.report) : null; }
  async list(): Promise<Player[]> { return structuredClone((await this.ensure()).players); }
  async get(id: string): Promise<Player | null> { const p = (await this.ensure()).byId.get(id); return p ? structuredClone(p) : null; }
  async search(q: Fc26SearchQuery): Promise<Fc26SearchResult> {
    const { players, index } = await this.ensure();
    const tokens = (q.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const excluded = new Set(q.excludeIds ?? []);
    const matches = players.filter(p => !excluded.has(p.id) && (!q.potId || p.potId === q.potId) &&
      matchesPositionGroup(p.positions ?? [p.subPosition ?? p.position], q.group ?? 'ALL') &&
      tokens.every(t => index.get(p.id)!.includes(t)));
    const offset = q.offset ?? 0;
    return { total: matches.length, players: structuredClone(matches.slice(offset, offset + (q.limit ?? 50))) };
  }
  async stats(): Promise<Fc26Stats> {
    const { players } = await this.ensure();
    const byPot: Record<string, number> = {};
    for (const p of players) byPot[p.potId] = (byPot[p.potId] ?? 0) + 1;
    return { total: players.length, underdogs: players.filter(p => p.draftPool === 'UNDERDOG').length, byPot };
  }
}

/** Used by tests and when Postgres or the FC26 schema is unavailable. */
export class MemoryFc26Catalog extends IndexedFc26Catalog {
  private readonly store = new Map<string, Player>();
  protected async persist(records: Fc26Record[]): Promise<Set<string>> {
    const added = new Set<string>();
    for (const { player } of records) {
      const existing = this.store.get(player.id);
      if (existing) { existing.name = player.name; if (player.fullName) existing.fullName = player.fullName; else delete existing.fullName; continue; }
      this.store.set(player.id, structuredClone(player)); added.add(player.id);
    }
    return added;
  }
  protected async load(): Promise<Player[]> { return [...this.store.values()]; }
}

const schemaMissing = (error: unknown): boolean => ['42703', '42P01'].includes((error as { code?: string })?.code ?? '');
const FC26_SCHEMA_MESSAGE = 'FC26 database schema is not installed. Apply migration 20261001090000_fc26_database_retention.sql (backend/scripts/apply-fc26-schema.mjs).';
type PlayerRow = {
  fc26_player_id: string; name: string; full_name: string | null; overall: number; potential: number | null; position: string;
  secondary_positions: string[] | null; club: string | null; nationality: string | null; league: string | null; age: number | null;
  preferred_foot: string | null; image_url: string | null; pace: number | null; shooting: number | null; passing: number | null;
  dribbling: number | null; defending: number | null; physical: number | null; draft_pool: string | null; player_tag: string | null;
  source_category: string | null; source_categories: string[] | null; auction_pot: string | null; base_price_units: number;
};
const STAT_COLUMNS = [['pac', 'pace', 'pace'], ['sho', 'shooting', 'shooting'], ['pas', 'passing', 'passing'],
  ['dri', 'dribbling', 'dribbling'], ['def', 'defending', 'defending'], ['phy', 'physical', 'physical']] as const;

export class PostgresFc26Catalog extends IndexedFc26Catalog {
  constructor(private readonly sql: Sql, config: Fc26Config, readFile?: (path: string) => Promise<string>) { super(config, readFile); }
  private wrap<T>(action: () => Promise<T>): Promise<T> {
    return action().catch(error => {
      if (schemaMissing(error)) throw new DomainError('FC26_SCHEMA_MISSING', FC26_SCHEMA_MESSAGE, 503);
      throw error;
    });
  }
  protected persist(records: Fc26Record[]): Promise<Set<string>> {
    return this.wrap(async () => {
      const added = new Set<string>();
      await this.sql.begin(async tx => {
        for (let i = 0; i < records.length; i += 50) {
          const rows = records.slice(i, i + 50).map(({ player: p, metadata }) => ({
            id: randomUUID(), external_id: null, fc26_player_id: p.id, name: p.name, full_name: p.fullName ?? null, overall: p.ovr,
            potential: p.potential ?? null, position: p.subPosition ?? p.position,
            secondary_positions: (p.positions ?? []).slice(1), club: p.club ?? null, nationality: p.nationality ?? null,
            league: p.league ?? null, age: p.age ?? null, preferred_foot: p.preferredFoot ?? null, image_url: p.photoUrl ?? null,
            base_price_units: p.basePriceUnits, pace: p.stats.pace ?? null, shooting: p.stats.shooting ?? null, passing: p.stats.passing ?? null,
            dribbling: p.stats.dribbling ?? null, defending: p.stats.defending ?? null, physical: p.stats.physical ?? null,
            draft_pool: p.draftPool ?? 'REGULAR', player_tag: p.playerTag ?? null, source_category: p.sourceCategory ?? null,
            source_categories: p.sourceCategories ?? [], auction_pot: p.potId, active: true, metadata: tx.json(JSON.parse(JSON.stringify(metadata))),
          }));
          // Re-import refreshes the display name (CSV short_name) and the searchable long name of existing rows;
          // everything else stays as stored. xmax = 0 marks rows that were newly inserted.
          const upserted = await tx<{ fc26_player_id: string; inserted: boolean }[]>`insert into public.football_players ${tx(rows)}
            on conflict (fc26_player_id) where fc26_player_id is not null
            do update set name = excluded.name, full_name = excluded.full_name
            returning fc26_player_id, (xmax = 0) as inserted`;
          for (const row of upserted) if (row.inserted) added.add(row.fc26_player_id);
        }
      });
      return added;
    });
  }
  protected load(): Promise<Player[]> {
    return this.wrap(async () => {
      const rows = await this.sql<PlayerRow[]>`select fc26_player_id, name, full_name, overall, potential, position, secondary_positions, club,
        nationality, league, age, preferred_foot, image_url, pace, shooting, passing, dribbling, defending, physical, draft_pool, player_tag,
        source_category, source_categories, auction_pot, base_price_units from public.football_players
        where fc26_player_id is not null and active = true`;
      return rows.map((r): Player => {
        const stats: Record<string, number> = {};
        for (const [short, long, column] of STAT_COLUMNS) { const v = r[column]; if (v !== null) { stats[short] = v; stats[long] = v; } }
        const positions = [r.position, ...(r.secondary_positions ?? [])];
        return { id: r.fc26_player_id, externalId: r.fc26_player_id, name: r.name, position: broadPosition(r.position), ovr: r.overall,
          stats, basePriceUnits: r.base_price_units, potId: (r.auction_pot ?? 'ATT') as Fc26Pot, positions, subPosition: r.position,
          draftPool: r.draft_pool === 'UNDERDOG' ? 'UNDERDOG' : 'REGULAR', sourceCategories: r.source_categories ?? [],
          ...(r.player_tag === 'UNDERDOG' ? { playerTag: 'UNDERDOG' as const } : {}),
          ...(r.source_category ? { sourceCategory: r.source_category } : {}), ...(r.full_name ? { fullName: r.full_name } : {}),
          ...(r.potential !== null ? { potential: r.potential } : {}),
          ...(positions.length > 1 ? { secondaryPositions: positions.slice(1).join(', ') } : {}),
          ...(r.club ? { club: r.club } : {}), ...(r.nationality ? { nationality: r.nationality } : {}), ...(r.league ? { league: r.league } : {}),
          ...(r.age !== null ? { age: r.age } : {}), ...(r.preferred_foot ? { preferredFoot: r.preferred_foot } : {}),
          ...(r.image_url ? { photoUrl: r.image_url } : {}) };
      });
    });
  }
}

import type { Sql } from 'postgres';
export interface ProfileHit { userId: string; username: string; displayName: string }
/** Registered users the host may bind to restored teams. */
export interface ProfileDirectory {
  search(query: string, limit: number): Promise<ProfileHit[]>;
  getMany(userIds: string[]): Promise<ProfileHit[]>;
}
export const PROFILE_SEARCH_MIN = 3;
export const PROFILE_SEARCH_LIMIT = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Escapes LIKE wildcards so user input matches literally. */
export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, c => '\\' + c);
export class PostgresProfileDirectory implements ProfileDirectory {
  constructor(private sql: Sql) {}
  async search(query: string, limit: number): Promise<ProfileHit[]> {
    const pattern = '%' + escapeLike(query.trim()) + '%';
    // default_team_name is only a search hint; it is never used to authorize anything.
    const rows = await this.sql`select id, username, display_name from public.profiles
      where username ilike ${pattern} or display_name ilike ${pattern} or default_team_name ilike ${pattern}
      order by username limit ${Math.min(limit, PROFILE_SEARCH_LIMIT)}`;
    return rows.map(r => ({ userId: String(r.id), username: String(r.username ?? ''), displayName: String(r.display_name ?? r.username ?? '') }));
  }
  async getMany(userIds: string[]): Promise<ProfileHit[]> {
    const ids = [...new Set(userIds)].filter(id => UUID.test(id));
    if (ids.length === 0) return [];
    const rows = await this.sql`select id, username, display_name from public.profiles where id in ${this.sql(ids)}`;
    return rows.map(r => ({ userId: String(r.id), username: String(r.username ?? ''), displayName: String(r.display_name ?? r.username ?? '') }));
  }
}
export class MemoryProfileDirectory implements ProfileDirectory {
  constructor(private profiles: ProfileHit[] = []) {}
  async search(query: string, limit: number): Promise<ProfileHit[]> {
    const q = query.trim().toLowerCase();
    return this.profiles.filter(p => p.username.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q)).slice(0, Math.min(limit, PROFILE_SEARCH_LIMIT));
  }
  async getMany(userIds: string[]): Promise<ProfileHit[]> {
    return this.profiles.filter(p => userIds.includes(p.userId));
  }
}

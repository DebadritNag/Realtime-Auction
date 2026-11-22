import type { Sql } from 'postgres';
import type { Room } from '../src/domain/types.js';
interface Row { code: string; room_id: string; host_user_id: string; status: string; sequence: number; state: Room; created_at: number; updated_at: number }
/** In-memory stand-in for the postgres `Sql` tag, covering only the statements PostgresLiveRoomRepository issues.
 * Unknown statements throw so SQL drift is caught. Statements run to completion synchronously, like a row update. */
export class FakeLiveSql {
  rows = new Map<string, Row>();
  tables = new Set<string>();
  now = Date.now();
  readonly fn: Sql;
  constructor() {
    const tag = ((strings: TemplateStringsArray, ...v: unknown[]) => Promise.resolve().then(() => this.run(strings.join('?').replace(/\s+/g, ' ').trim(), v))) as unknown as Sql & { json: (x: unknown) => unknown };
    tag.json = (x: unknown) => structuredClone(x);
    this.fn = tag;
  }
  private run(text: string, v: unknown[]): unknown[] {
    for (const m of text.matchAll(/(?:into|from|update) (public\.\w+)/g)) this.tables.add(m[1]!);
    let m: RegExpMatchArray | null;
    if (text.startsWith('insert into public.live_room_snapshots (code, room_id, host_user_id, status, sequence, state) values (?, ?, ?, ?, ?, ?)')) {
      const [code, room_id, host_user_id, status, sequence, state] = v as [string, string, string, string, number, Room];
      if (this.rows.has(code) || [...this.rows.values()].some(r => r.room_id === room_id)) throw Object.assign(new Error('duplicate key'), { code: '23505' });
      this.rows.set(code, { code, room_id, host_user_id, status, sequence, state: structuredClone(state), created_at: this.now, updated_at: this.now });
      return [];
    }
    if (text.startsWith('update public.live_room_snapshots set status=?, sequence=?, state=?, updated_at=now() where code=? and sequence=? returning sequence')) {
      const [status, sequence, state, code, expected] = v as [string, number, Room, string, number];
      const row = this.rows.get(code);
      if (!row || row.sequence !== expected) return [];
      Object.assign(row, { status, sequence, state: structuredClone(state), updated_at: this.now });
      return [{ sequence }];
    }
    if ((m = text.match(/^select state from public\.live_room_snapshots where code=\?$/))) return [...this.rows.values()].filter(r => r.code === v[0]).map(r => ({ state: structuredClone(r.state) }));
    if (text === 'select state from public.live_room_snapshots where room_id=?') return [...this.rows.values()].filter(r => r.room_id === v[0]).map(r => ({ state: structuredClone(r.state) }));
    if (text === 'select state from public.live_room_snapshots order by created_at') return [...this.rows.values()].map(r => ({ state: structuredClone(r.state) }));
    if (text === "select state from public.live_room_snapshots where status <> 'COMPLETED' order by created_at") return [...this.rows.values()].filter(r => r.status !== 'COMPLETED').map(r => ({ state: structuredClone(r.state) }));
    if (text.startsWith('select state from public.live_room_snapshots where exists (select 1 from jsonb_array_elements(state->\'teams\') t where t->>\'userId\'=?)'))
      return [...this.rows.values()].filter(r => r.state.teams.some(t => t.userId === v[0])).map(r => ({ state: structuredClone(r.state) }));
    if (text === "delete from public.live_room_snapshots where status='LOBBY' and updated_at < now() - make_interval(days => ?) returning code") {
      const cutoff = this.now - Number(v[0]) * 86_400_000;
      const gone = [...this.rows.values()].filter(r => r.status === 'LOBBY' && r.updated_at < cutoff);
      for (const r of gone) this.rows.delete(r.code);
      return gone.map(r => ({ code: r.code }));
    }
    if (text === 'select 1 from public.live_room_snapshots limit 1') return [];
    throw new Error(`FakeLiveSql: unsupported statement: ${text}`);
  }
}

"use client";

import React, { useEffect, useId, useState } from "react";
import { Search } from "lucide-react";
import { restoreService } from "@/services/restore.service";
import { normalizeError } from "@/services/api";
import type { PlayerDTO } from "@/types/backend";
import type { RestorePoolGroup, RestorePoolResponse } from "@/types/restore";

const PAGE = 20;
const GROUPS: RestorePoolGroup[] = ["ALL", "GK", "CB", "FB", "CDM", "CMID", "CAM", "WM", "ST", "W"];
const POTS: [string, string][] = [["GK", "GK"], ["CB", "CB"], ["FB", "FB"], ["MID", "MID"], ["ATT", "ATT"]];

/** Remaining player pool of a restored room: eligible players only, restored squad players are already excluded by the server. */
export function RestorePoolPanel({ roomCode }: { roomCode: string }) {
  const searchId = useId();
  const groupId = useId();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [group, setGroup] = useState<RestorePoolGroup>("ALL");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<RestorePoolResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => { setTerm(search); setOffset(0); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    restoreService
      .pool(roomCode, { search: term, group, offset, limit: PAGE }, controller.signal)
      .then((res) => { setData(res); setError(null); })
      .catch((e) => { if (!controller.signal.aborted) setError(normalizeError(e).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [roomCode, term, group, offset]);

  const total = data?.total ?? 0;
  const label = (p: PlayerDTO) => p.subPosition || p.position;
  return (
    <section aria-labelledby="restore-pool-heading" className="rounded-2xl bg-[#0e121a] border border-[#242c3d] p-4 space-y-3" data-testid="restore-pool-panel">
      <div>
        <h2 id="restore-pool-heading" className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">REMAINING POOL</h2>
        <p className="text-xs text-[#cbd5e1]" data-testid="restore-pool-summary">
          {data ? <>{data.poolTotal} players will be auctioned. {data.ownedCount} are already in restored squads. Players newly added to the database are included.</> : "Loading the remaining pool."}
        </p>
      </div>
      {data ? (
        <dl className="grid grid-cols-5 gap-1.5 text-center text-[10px]">
          {POTS.map(([key, name]) => (
            <div key={key} className="rounded-md bg-[#151a24] border border-[#242c3d] py-1">
              <dt className="font-bold uppercase text-[#64748b]">{name}</dt>
              <dd className="font-mono font-bold text-white">{data.byPot[key] ?? 0}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <label htmlFor={searchId} className="sr-only">Search the remaining pool</label>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748b] pointer-events-none" aria-hidden="true" />
          <input id={searchId} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search players"
            className="w-full h-9 pl-8 pr-2 rounded-lg bg-[#151a24] border border-[#242c3d] text-xs text-white outline-none focus:border-[#00ff87]" />
        </div>
        <div>
          <label htmlFor={groupId} className="sr-only">Position group</label>
          <select id={groupId} value={group} onChange={(e) => { setGroup(e.target.value as RestorePoolGroup); setOffset(0); }}
            className="h-9 w-full sm:w-auto rounded-lg bg-[#151a24] border border-[#242c3d] px-2 text-xs text-white cursor-pointer outline-none focus:border-[#00ff87]">
            {GROUPS.map((g) => <option key={g} value={g}>{g === "ALL" ? "All positions" : g}</option>)}
          </select>
        </div>
      </div>
      {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
      <ul className={"divide-y divide-[#242c3d] transition-opacity duration-200 " + (loading ? "opacity-60" : "")} data-testid="restore-pool-list">
        {(data?.players ?? []).map((p) => (
          <li key={p.id} className="flex items-center gap-2 py-1.5 text-xs">
            <span className="truncate font-bold text-[#f8fafc]">{p.name}</span>
            {p.playerTag === "UNDERDOG" ? <span className="shrink-0 rounded border border-fuchsia-400/50 bg-fuchsia-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-fuchsia-200">Underdog</span> : null}
            <span className="ml-auto shrink-0 font-mono text-[#94a3b8]">{label(p)}</span>
            <span className="w-7 shrink-0 text-right font-mono font-bold text-[#f5c542]">{p.ovr}</span>
          </li>
        ))}
        {data && data.players.length === 0 ? <li className="py-3 text-xs text-[#64748b]">No players match.</li> : null}
      </ul>
      <div className="flex items-center justify-between text-xs text-[#94a3b8]">
        <span data-testid="restore-pool-range">{total === 0 ? "0" : offset + 1 + "-" + Math.min(offset + PAGE, total)} of {total}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setOffset(Math.max(0, offset - PAGE))} disabled={offset === 0 || loading}
            className="h-8 px-3 rounded-lg border border-[#242c3d] bg-[#151a24] font-bold cursor-pointer transition-colors duration-200 hover:border-[#37435e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87] disabled:opacity-40 disabled:cursor-not-allowed">Previous</button>
          <button type="button" onClick={() => setOffset(offset + PAGE)} disabled={offset + PAGE >= total || loading}
            className="h-8 px-3 rounded-lg border border-[#242c3d] bg-[#151a24] font-bold cursor-pointer transition-colors duration-200 hover:border-[#37435e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87] disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
        </div>
      </div>
    </section>
  );
}

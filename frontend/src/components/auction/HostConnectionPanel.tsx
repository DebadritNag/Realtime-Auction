"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import { useAuctionStore } from "@/stores/auction.store";
import { relativeTime } from "@/lib/relativeTime";
import type { TeamPresenceDTO } from "@/types/backend";
import { ChevronDown, Users } from "lucide-react";

const Badge = ({ on }: { on: boolean }) => (
  <span className={"inline-flex items-center gap-1.5 text-[10px] font-black tracking-wider px-2 py-0.5 rounded border " + (on ? "text-[#00ff87] border-[#00ff87]/40 bg-[#00ff87]/10" : "text-slate-300 border-slate-500/50 bg-slate-500/10")}>
    <span className={"w-1.5 h-1.5 rounded-full " + (on ? "bg-[#00ff87]" : "bg-slate-400")} aria-hidden="true" />
    {on ? "CONNECTED" : "DISCONNECTED"}
  </span>
);

/**
 * Host only. Read-only view of which team managers are connected; the server only sends teamPresence to the host.
 * Collapsed by default to a one-line summary so it never pushes the live auction down; the details open in a popover.
 */
export function HostConnectionPanel({ isHost }: { isHost: boolean }) {
  const snapshot = useAuctionStore((s) => s.snapshot);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const bodyId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);
  if (!isHost || !snapshot) return null;
  const rows: (TeamPresenceDTO & { name: string })[] = (snapshot.teamPresence ?? []).map((p) => ({
    ...p, name: snapshot.teams.find((t) => t.id === p.teamId)?.name ?? p.teamId,
  }));
  if (!rows.length) return null;
  const now = Date.now();
  const online = rows.filter((r) => r.connected).length;
  const allOnline = online === rows.length;
  return (
    <section ref={rootRef} aria-label="Team connections" data-testid="host-connection-panel" className="host-connections relative text-xs">
      <button
        type="button"
        aria-label={"Team connections, " + online + "/" + rows.length + " connected"}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className="host-connections-toggle inline-flex items-center gap-2 rounded-lg border border-[#242c3d] bg-[#080a0f] px-3 text-[#e2e8f0] hover:border-[#37435e] transition-colors duration-200 cursor-pointer"
      >
        <Users className="w-3.5 h-3.5 text-[#a5b4c5]" aria-hidden="true" />
        <span className="host-connections-label font-semibold">Team connections</span>
        <span className={"font-black tabular-nums " + (allOnline ? "text-[#00ff87]" : "text-amber-300")}>{online}/{rows.length} connected</span>
        <ChevronDown className={"w-3.5 h-3.5 text-[#a5b4c5] " + (open ? "rotate-180" : "")} aria-hidden="true" />
      </button>
      {open ? (
        <div id={bodyId} className="host-connections-body absolute right-0 top-full mt-1 z-30 w-[min(92vw,560px)] max-h-[min(60vh,420px)] overflow-y-auto rounded-xl bg-[#080a0f] border border-[#242c3d] p-3 shadow-2xl">
          <table className="hidden sm:table w-full text-left">
            <thead className="text-[#94a3b8]"><tr><th className="py-1 font-semibold">Team</th><th className="font-semibold">Manager</th><th className="font-semibold">Status</th><th className="font-semibold">Last seen</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.teamId} className="border-t border-[#242c3d] text-[#e2e8f0]">
                  <td className="py-1.5">{r.name}</td><td>{r.managerUsername}</td><td><Badge on={r.connected} /></td>
                  <td>{r.connected ? "now" : relativeTime(r.lastSeenAt, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="sm:hidden space-y-2">
            {rows.map((r) => (
              <li key={r.teamId} className="rounded-lg border border-[#242c3d] p-2 flex flex-col gap-1 text-[#e2e8f0]">
                <div className="flex items-center justify-between gap-2"><span className="font-semibold truncate">{r.name}</span><Badge on={r.connected} /></div>
                <span className="text-[#94a3b8]">{r.managerUsername} &middot; last seen {r.connected ? "now" : relativeTime(r.lastSeenAt, now)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

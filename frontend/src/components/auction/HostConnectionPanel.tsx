"use client";
import React from "react";
import { useAuctionStore } from "@/stores/auction.store";
import { relativeTime } from "@/lib/relativeTime";
import type { TeamPresenceDTO } from "@/types/backend";

const Badge = ({ on }: { on: boolean }) => (
  <span className={"inline-flex items-center gap-1.5 text-[10px] font-black tracking-wider px-2 py-0.5 rounded border " + (on ? "text-[#00ff87] border-[#00ff87]/40 bg-[#00ff87]/10" : "text-slate-300 border-slate-500/50 bg-slate-500/10")}>
    <span className={"w-1.5 h-1.5 rounded-full " + (on ? "bg-[#00ff87]" : "bg-slate-400")} aria-hidden="true" />
    {on ? "CONNECTED" : "DISCONNECTED"}
  </span>
);

/** Host only. Read-only view of which team managers are connected; the server only sends teamPresence to the host. */
export function HostConnectionPanel({ isHost }: { isHost: boolean }) {
  const snapshot = useAuctionStore((s) => s.snapshot);
  if (!isHost || !snapshot) return null;
  const rows: (TeamPresenceDTO & { name: string })[] = (snapshot.teamPresence ?? []).map((p) => ({
    ...p, name: snapshot.teams.find((t) => t.id === p.teamId)?.name ?? p.teamId,
  }));
  if (!rows.length) return null;
  const now = Date.now();
  return (
    <section aria-label="Team connections" data-testid="host-connection-panel" className="rounded-xl bg-[#080a0f] border border-[#242c3d] p-3 text-xs">
      <h2 className="text-[10px] font-black uppercase tracking-widest text-[#a5b4c5] mb-2">Team connections</h2>
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
    </section>
  );
}

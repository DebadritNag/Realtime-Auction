"use client";

import React, { useState } from "react";
import { CircleAlert, ShieldCheck, Users, UserX } from "lucide-react";
import { formatCr } from "@/lib/utils";
import { normalizeError } from "@/services/api";
import { ManagerPicker } from "./RestoreWorkflow";
import type { RestoreStateDTO } from "@/types/restore";

export interface RestoreLobbyPanelProps {
  restore: RestoreStateDTO;
  isHost: boolean;
  /** The viewer's own team; the host cannot release it. */
  currentTeamId?: string | null;
  maxSquadSize?: number;
  onRelease: (teamId: string) => Promise<void>;
  /** Host only. userId null removes the reservation. Omit to hide the control. */
  onBind?: (teamId: string, userId: string | null) => Promise<void>;
}

/** Lobby view of a restored auction: every team with its exact purse and squad, who has claimed it, and the host's release action. */
export function RestoreLobbyPanel({ restore, isHost, currentTeamId, maxSquadSize = 20, onRelease, onBind }: RestoreLobbyPanelProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const release = async (teamId: string) => {
    setBusyId(teamId);
    setError(null);
    try {
      await onRelease(teamId);
    } catch (e) {
      setError(normalizeError(e).message);
    } finally {
      setBusyId(null);
    }
  };

  const bind = async (teamId: string, userId: string | null) => {
    if (!onBind) return;
    setBusyId(teamId);
    setError(null);
    try {
      await onBind(teamId, userId);
    } catch (e) {
      setError(normalizeError(e).message);
    } finally {
      setBusyId(null);
    }
  };
  return (
    <section aria-labelledby="restore-lobby-heading" className="space-y-3" data-testid="restore-lobby-panel">
      <div className="flex items-center gap-2 pb-2 border-b border-[#242c3d]">
        <Users className="w-4 h-4 text-[#00ff87]" aria-hidden="true" />
        <h2 id="restore-lobby-heading" className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">
          RESTORED TEAMS ({restore.teams.length - restore.unclaimedCount} / {restore.teams.length} CLAIMED)
        </h2>
      </div>
      {restore.unclaimedCount > 0 ? (
        <p role="status" className="flex items-start gap-1.5 text-xs text-amber-300" data-testid="restore-unclaimed-note">
          <CircleAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
          {restore.unclaimedCount} {restore.unclaimedCount === 1 ? "team has" : "teams have"} no manager yet. The auction can start when every team is claimed.
        </p>
      ) : null}
      {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
      <ul className="space-y-3">
        {restore.teams.map((team) => (
          <li key={team.teamId} data-testid="restore-lobby-team" data-claimed={team.claimed ? "true" : "false"}
            className={"rounded-2xl border p-4 bg-[#0e121a] " + (team.claimed ? "border-[#00ff87]/30" : "border-[#242c3d]")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[#f8fafc] truncate">
                  {team.name}
                  {team.teamId === currentTeamId ? <span className="ml-2 rounded bg-[#00ff87] px-1.5 py-0.5 text-[9px] font-black uppercase text-[#08090d]">YOU</span> : null}
                </h3>
                {team.originalName && team.originalName !== team.name
                  ? <p className="text-[11px] text-[#64748b]" data-testid="restore-original-name">was {team.originalName}</p> : null}
                {team.reserved ? (
                  <p className="text-[11px] text-sky-300" data-testid="restore-reserved-label">
                    Reserved for {team.reservedLabel || "a registered user"}
                  </p>
                ) : null}
                <span data-testid="restore-claim-state"
                  className={"mt-1 inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider " +
                    (team.claimed ? "border-[#00ff87]/40 bg-[#00ff87]/10 text-[#00ff87]" : "border-amber-400/40 bg-amber-400/10 text-amber-300")}>
                  {team.claimed ? "Claimed" : "Unclaimed"}
                </span>
              </div>
              {isHost && team.claimed && team.teamId !== currentTeamId ? (
                <button type="button" onClick={() => void release(team.teamId)} disabled={busyId === team.teamId}
                  aria-label={"Release " + team.name}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#37435e] bg-[#151a24] px-2.5 py-1.5 text-xs font-bold text-[#cbd5e1] cursor-pointer transition-colors duration-200 hover:border-red-500/60 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87] disabled:opacity-50 disabled:cursor-not-allowed">
                  <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                  Release
                </button>
              ) : null}
            </div>
            {isHost && onBind && !team.claimed && team.teamId !== currentTeamId ? (
              <div className="mt-3" data-testid="restore-bind-control">
                {team.reserved ? (
                  <button type="button" onClick={() => void bind(team.teamId, null)} disabled={busyId === team.teamId}
                    aria-label={"Remove manager for " + team.name}
                    className="rounded-lg border border-[#37435e] bg-[#151a24] px-2.5 py-1.5 text-xs font-bold text-[#cbd5e1] cursor-pointer transition-colors duration-200 hover:border-red-500/60 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87] disabled:opacity-50 disabled:cursor-not-allowed">
                    Remove manager
                  </button>
                ) : (
                  <ManagerPicker teamName={team.name} takenIds={[]} onChange={(u) => { if (u) void bind(team.teamId, u.userId); }} />
                )}
              </div>
            ) : null}
            <dl className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <div><dt className="text-[10px] uppercase text-[#64748b]">Purse</dt><dd className="font-mono font-bold text-[#00ff87]" data-testid="restore-lobby-purse">{formatCr(team.purseCr)}</dd></div>
              <div><dt className="text-[10px] uppercase text-[#64748b]">Squad</dt><dd className="font-mono font-bold text-white" data-testid="restore-lobby-squad">{team.squadSize}/{maxSquadSize}</dd></div>
              <div><dt className="text-[10px] uppercase text-[#64748b]">Slots left</dt><dd className="font-mono font-bold text-white" data-testid="restore-lobby-slots">{team.remainingSlots}</dd></div>
              <div><dt className="flex items-center gap-1 text-[10px] uppercase text-[#64748b]"><ShieldCheck className="w-3 h-3" aria-hidden="true" />Retained</dt><dd className="font-mono font-bold text-white">{team.retainedCount}</dd></div>
              <div><dt className="text-[10px] uppercase text-[#64748b]">Auction</dt><dd className="font-mono font-bold text-white">{team.auctionCount}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

"use client";
import React from "react";
import { Wallet } from "lucide-react";
import { cn, formatCr } from "@/lib/utils";
import type { RetentionStateDTO, TeamDTO } from "@/types/backend";

export interface RetentionTeamSwitcherProps {
  teams: TeamDTO[];
  retention: RetentionStateDTO;
  currentTeamId: string;
  viewTeamId: string;
  onSelect: (teamId: string) => void;
}

/** Lists every team. Only the signed-in user's own team can retain; others are read-only. */
export function RetentionTeamSwitcher({ teams, retention, currentTeamId, viewTeamId, onSelect }: RetentionTeamSwitcherProps) {
  const view = teams.find((t) => t.id === viewTeamId) ?? teams[0];
  const stats = retention.teams.find((t) => t.teamId === view?.id);
  const max = retention.config.maxPerTeam;
  if (!view) return null;
  return (
    <section aria-label="Teams" className="space-y-3">
      <div role="tablist" aria-label="Participating teams" className="flex flex-wrap gap-2">
        {teams.map((team) => {
          const count = retention.teams.find((t) => t.teamId === team.id)?.retainedCount ?? 0;
          const selected = team.id === view.id;
          return (
            <button
              key={team.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(team.id)}
              className={cn(
                "cursor-pointer rounded-lg border px-3 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87]",
                selected
                  ? "border-[#00ff87]/60 bg-[#00ff87]/10 text-[#f8fafc]"
                  : "border-[#242c3d] bg-[#151a24] text-[#cbd5e1] hover:border-[#37435e] hover:bg-[#1e2433]"
              )}
            >
              <span className="font-bold">{team.name}</span>
              {team.id === currentTeamId ? (
                <span className="ml-1.5 rounded bg-[#00ff87] px-1 text-[9px] font-black uppercase text-[#08090d]">You</span>
              ) : null}
              <span className="ml-2 font-mono text-[11px] text-[#94a3b8]">{count}/{max}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#242c3d] bg-[#0e121a] p-3 text-xs sm:grid-cols-4" data-testid="retention-team-summary">
        <div className="col-span-2 sm:col-span-1">
          <p className="text-[10px] font-bold uppercase text-[#64748b]">Team</p>
          <p className="truncate text-sm font-black text-[#f8fafc]" data-testid="retention-team-name">{view.name}</p>
          <p className="truncate text-[11px] text-[#94a3b8]" data-testid="retention-team-manager">
            Manager: {view.managerUsername ? "@" + view.managerUsername : "not available"}
          </p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-[#64748b]"><Wallet className="h-3 w-3" aria-hidden="true" /> Remaining purse</p>
          <p className="font-mono text-sm font-black text-amber-400" data-testid="retention-team-purse">{formatCr(stats?.remainingPurseCr ?? view.remainingBudgetCr)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase text-[#64748b]">Retained players</p>
          <p className="font-mono text-sm font-black text-[#f8fafc]" data-testid="retention-team-count">{stats?.retainedCount ?? 0}/{max}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase text-[#64748b]">Remaining slots</p>
          <p className="font-mono text-sm font-black text-[#f8fafc]" data-testid="retention-team-slots">{stats?.remainingSlots ?? max}</p>
        </div>
      </div>
      {view.id !== currentTeamId ? (
        <p className="text-[11px] text-[#94a3b8]">You are viewing another team. Only its manager can retain players for it.</p>
      ) : null}
    </section>
  );
}

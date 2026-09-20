"use client";

import React from "react";
import { Team } from "@/types";
import { formatCr } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";
import { cn } from "@/lib/utils";

export interface BudgetTickerProps {
  teams: Team[];
  currentTeamId?: string | null;
}

export const BudgetTicker: React.FC<BudgetTickerProps> = ({
  teams,
  currentTeamId,
}) => {
  const { openTeamQuickView } = useUIStore();

  return (
    <div className="auction-budget-ticker w-full bg-[#0b0e14] border-b border-[#242c3d] overflow-x-auto py-2 px-3 shadow-inner">
      <div className="flex items-center gap-3 min-w-max">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#64748b] pl-1 pr-2 border-r border-[#242c3d]">
          PURSE TICKER
        </span>

        {teams.map((team) => {
          const isUserTeam = team.id === currentTeamId || team.isCurrentUser;
          return (
            <button
              key={team.id}
              onClick={() => openTeamQuickView(team.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs transition-all cursor-pointer select-none",
                isUserTeam
                  ? "bg-[#00ff87]/15 border border-[#00ff87]/50 text-[#f8fafc] shadow-[0_0_12px_rgba(0,255,135,0.2)]"
                  : "bg-[#151a24] border border-[#242c3d] text-[#cbd5e1] hover:border-[#37435e] hover:bg-[#1e2433]"
              )}
            >
              <span className="text-sm shrink-0">{team.logo}</span>
              <span className="font-bold text-[11px] tracking-wide">
                {team.shortName}
              </span>
              <span
                className={cn(
                  "font-mono font-bold tabular-nums text-[11px]",
                  isUserTeam ? "text-[#00ff87]" : "text-amber-400"
                )}
              >
                {formatCr(team.budgetRemaining)}
              </span>
              {isUserTeam && (
                <span className="text-[9px] font-extrabold uppercase px-1 rounded bg-[#00ff87] text-[#08090d]">
                  YOU
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

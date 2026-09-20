"use client";

import React from "react";
import { Team } from "@/types";
import { formatCr } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";
import { Users, ChevronRight } from "lucide-react";

export interface TeamPanelProps {
  teams: Team[];
  currentTeamId?: string | null;
}

export const TeamPanel: React.FC<TeamPanelProps> = ({
  teams,
  currentTeamId,
}) => {
  const { openTeamQuickView } = useUIStore();

  return (
    <div className="flex flex-col h-full bg-[#0e121a] rounded-2xl border border-[#242c3d] p-3 text-[#f8fafc] shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-[#242c3d]">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#00ff87]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#f8fafc]">
            PARTICIPATING TEAMS
          </h3>
        </div>
        <span className="text-[11px] font-mono text-[#94a3b8]">
          {teams.length} Teams
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 mt-2 pr-1">
        {teams.map((team) => {
          const isUser = team.id === currentTeamId || team.isCurrentUser;
          return (
            <div
              key={team.id}
              onClick={() => openTeamQuickView(team.id)}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer select-none group ${
                isUser
                  ? "bg-[#00ff87]/10 border-[#00ff87]/50 shadow-[0_0_15px_rgba(0,255,135,0.12)]"
                  : "bg-[#151a24] border-[#242c3d] hover:border-[#37435e] hover:bg-[#1a2130]"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-lg">{team.logo}</span>
                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-[#f8fafc] group-hover:text-[#00ff87] transition-colors">
                        {team.name}
                      </span>
                      {isUser && (
                        <span className="text-[9px] font-extrabold bg-[#00ff87] text-[#08090d] px-1 rounded uppercase">
                          YOU
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-[#64748b]">
                      @{team.managerUsername}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="font-mono font-bold text-xs text-amber-400 block">
                    {formatCr(team.budgetRemaining)}
                  </span>
                  <span className="text-[10px] text-[#64748b]">
                    {team.squadCount} Players
                  </span>
                </div>
              </div>

              {/* Position Quota Breakdown */}
              <div className="flex items-center justify-between text-[10px] font-mono bg-[#080a0f]/60 rounded px-2 py-1 border border-[#1e2536] text-[#94a3b8]">
                <span>GK {team.positions?.gk ?? 0}</span>
                <span>•</span>
                <span>DEF {team.positions?.def ?? 0}</span>
                <span>•</span>
                <span>MID {team.positions?.mid ?? 0}</span>
                <span>•</span>
                <span>ATT {team.positions?.att ?? 0}</span>
                <ChevronRight className="w-3 h-3 text-[#64748b] group-hover:text-[#00ff87] transition-colors ml-1" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

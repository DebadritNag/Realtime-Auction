"use client";

import React from "react";
import { Player, Team } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { formatCr } from "@/lib/utils";
import { Shield, Users, DollarSign } from "lucide-react";

export interface SquadFormationViewProps {
  team: Team;
  squad: Player[];
}

export const SquadFormationView: React.FC<SquadFormationViewProps> = ({
  team,
  squad,
}) => {
  const gkList = squad.filter((p) => p.position === "GK");
  const defList = squad.filter((p) => p.position === "DEF");
  const midList = squad.filter((p) => p.position === "MID");
  const attList = squad.filter((p) => p.position === "ATT");

  const renderPositionGroup = (
    title: string,
    players: Player[],
    colorClass: string
  ) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-[#242c3d]">
        <h3 className={`text-xs font-bold uppercase tracking-wider ${colorClass}`}>
          {title} ({players.length})
        </h3>
      </div>

      {players.length === 0 ? (
        <p className="text-xs text-[#64748b] italic py-2">
          No {title.toLowerCase()} signed yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {players.map((p) => (
            <div
              key={p.id}
              className="p-3.5 rounded-2xl bg-[#0e121a] border border-[#242c3d] hover:border-[#37435e] transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <span className="text-xl font-black font-mono text-[#f8fafc]">
                    {p.ovr}
                  </span>
                  <Badge variant="position" position={p.position} size="sm">
                    {p.subPosition || p.position}
                  </Badge>
                </div>
                <div>
                  <h4 className="font-bold text-sm text-[#f8fafc]">{p.name}</h4>
                  <p className="text-[11px] text-[#64748b]">
                    {p.club} • {p.nationality}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-[#64748b] block">Signed Fee</span>
                <span className="text-xs font-mono font-bold text-amber-400">
                  {formatCr(p.soldPrice || p.basePrice)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Team Header Banner */}
      <div className="rounded-3xl bg-[#0e121a] border border-[#242c3d] p-6 sm:p-8 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4 text-center sm:text-left">
          <div className="w-20 h-20 rounded-2xl bg-[#151a24] border border-[#242c3d] flex items-center justify-center text-4xl shadow-inner">
            {team.logo}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-[#f8fafc] tracking-tight">
                {team.name}
              </h1>
              {team.isCurrentUser && (
                <span className="text-[10px] font-black uppercase bg-[#00ff87] text-[#08090d] px-2 py-0.5 rounded">
                  YOUR SQUAD
                </span>
              )}
            </div>
            <p className="text-xs text-[#94a3b8] mt-1">
              Manager: <strong className="text-[#f8fafc]">@{team.managerUsername}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="bg-[#151a24] p-3 rounded-xl border border-[#242c3d] text-center min-w-[110px]">
            <span className="text-[10px] text-[#64748b] font-bold uppercase block mb-1">
              PURSE SPENT
            </span>
            <span className="text-base font-black font-mono text-amber-400">
              {formatCr(team.budgetSpent)}
            </span>
          </div>

          <div className="bg-[#151a24] p-3 rounded-xl border border-[#242c3d] text-center min-w-[110px]">
            <span className="text-[10px] text-[#64748b] font-bold uppercase block mb-1">
              LEFTOVER PURSE
            </span>
            <span className="text-base font-black font-mono text-[#00ff87]">
              {formatCr(team.budgetRemaining)}
            </span>
          </div>

          <div className="bg-[#151a24] p-3 rounded-xl border border-[#242c3d] text-center min-w-[90px]">
            <span className="text-[10px] text-[#64748b] font-bold uppercase block mb-1">
              ROSTER
            </span>
            <span className="text-base font-black font-mono text-[#f8fafc]">
              {squad.length} / 18
            </span>
          </div>
        </div>
      </div>

      {/* Position Grouped Formation */}
      <div className="space-y-6">
        {renderPositionGroup("Attackers", attList, "text-rose-400")}
        {renderPositionGroup("Midfielders", midList, "text-emerald-400")}
        {renderPositionGroup("Defenders", defList, "text-blue-400")}
        {renderPositionGroup("Goalkeepers", gkList, "text-amber-400")}
      </div>
    </div>
  );
};

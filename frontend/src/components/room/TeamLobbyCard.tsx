"use client";

import React from "react";
import { Team } from "@/types";
import { formatCr } from "@/lib/utils";
import { CheckCircle2, Clock, Trash2 } from "lucide-react";

export interface TeamLobbyCardProps {
  team: Team;
  isHost: boolean;
  onRemove?: (teamId: string) => void;
}

export const TeamLobbyCard: React.FC<TeamLobbyCardProps> = ({
  team,
  isHost,
  onRemove,
}) => {
  return (
    <div
      className={`relative flex items-center justify-between p-4 rounded-2xl border transition-all ${
        team.ready
          ? "bg-[#0e121a] border-[#00ff87]/30 shadow-[0_0_20px_rgba(0,255,135,0.06)]"
          : "bg-[#0e121a] border-[#242c3d]"
      }`}
    >
      <div className="flex items-center gap-3.5 truncate">
        {/* Team Crest Icon */}
        <div className="w-12 h-12 rounded-xl bg-[#151a24] border border-[#242c3d] flex items-center justify-center text-2xl shrink-0 shadow-inner">
          {team.logo}
        </div>

        <div className="truncate">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[#f8fafc] truncate">
              {team.name}
            </h3>
            {team.isCurrentUser && (
              <span className="text-[9px] font-black uppercase bg-[#00ff87] text-[#08090d] px-1.5 py-0.2 rounded">
                YOU
              </span>
            )}
          </div>
          <p className="text-xs text-[#64748b]">
            Manager: <strong className="text-[#94a3b8]">@{team.managerUsername}</strong>
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-mono text-[#00ff87] bg-[#00ff87]/10 px-1.5 py-0.2 rounded">
              Purse: {formatCr(team.budgetTotal)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 ml-3">
        {/* Ready indicator */}
        <div className="flex items-center gap-1.5">
          {team.ready ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-[#00ff87] bg-[#00ff87]/15 border border-[#00ff87]/30 px-2 py-1 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5" />
              READY
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#94a3b8] bg-[#151a24] border border-[#242c3d] px-2 py-1 rounded-lg">
              <Clock className="w-3.5 h-3.5 text-[#64748b]" />
              WAITING
            </span>
          )}
        </div>

        {/* Connection status indicator */}
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            team.connected
              ? "bg-[#00ff87] shadow-[0_0_8px_#00ff87]"
              : "bg-red-500 shadow-[0_0_8px_#ef4444]"
          }`}
          title={team.connected ? "Connected" : "Disconnected"}
        />

        {/* Host Remove Option */}
        {isHost && !team.isCurrentUser && onRemove && (
          <button
            onClick={() => onRemove(team.id)}
            aria-label="Remove team"
            className="p-1.5 rounded-lg text-[#64748b] hover:text-[#ef4444] hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

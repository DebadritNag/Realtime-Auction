"use client";

import React from "react";
import { RoomSettings } from "@/types";
import { formatCr } from "@/lib/utils";
import { Sliders, Shield, Clock, Coins, Users } from "lucide-react";

export interface AuctionSettingsSummaryProps {
  settings: RoomSettings;
}

export const AuctionSettingsSummary: React.FC<AuctionSettingsSummaryProps> = ({
  settings,
}) => {
  return (
    <div className="rounded-2xl bg-[#0e121a] border border-[#242c3d] p-5 shadow-lg space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-[#242c3d]">
        <Sliders className="w-4 h-4 text-[#00ff87]" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#f8fafc]">
          AUCTION RULES & SETTINGS
        </h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        <div className="bg-[#151a24] p-3 rounded-xl border border-[#242c3d]">
          <span className="text-[10px] text-[#64748b] font-bold uppercase flex items-center gap-1 mb-1">
            <Coins className="w-3 h-3 text-[#00ff87]" />
            STARTING PURSE
          </span>
          <span className="text-base font-black font-mono text-[#f8fafc]">
            {formatCr(settings.startingBudget)}
          </span>
        </div>

        <div className="bg-[#151a24] p-3 rounded-xl border border-[#242c3d]">
          <span className="text-[10px] text-[#64748b] font-bold uppercase flex items-center gap-1 mb-1">
            <Users className="w-3 h-3 text-blue-400" />
            SQUAD SIZE LIMITS
          </span>
          <span className="text-base font-black font-mono text-[#f8fafc]">
            {settings.minSquadSize} – {settings.maxSquadSize} Players
          </span>
        </div>

        <div className="bg-[#151a24] p-3 rounded-xl border border-[#242c3d]">
          <span className="text-[10px] text-[#64748b] font-bold uppercase flex items-center gap-1 mb-1">
            <Clock className="w-3 h-3 text-amber-400" />
            TIMER PER PLAYER
          </span>
          <span className="text-base font-black font-mono text-[#f8fafc]">
            {settings.playerTimerSeconds} Seconds
          </span>
        </div>

        <div className="bg-[#151a24] p-3 rounded-xl border border-[#242c3d]">
          <span className="text-[10px] text-[#64748b] font-bold uppercase flex items-center gap-1 mb-1">
            <Shield className="w-3 h-3 text-[#00ff87]" />
            ANTI-SNIPING
          </span>
          <span className="text-sm font-bold text-[#00ff87]">
            {settings.antiSnipingEnabled
              ? `Active (<${settings.antiSnipingThresholdSeconds}s adds +${settings.timerResetDurationSeconds}s)`
              : "Disabled"}
          </span>
        </div>

        <div className="bg-[#151a24] p-3 rounded-xl border border-[#242c3d]">
          <span className="text-[10px] text-[#64748b] font-bold uppercase block mb-1">
            MIN BASE PRICE
          </span>
          <span className="text-base font-black font-mono text-[#f8fafc]">
            {formatCr(settings.minPlayerBasePrice)}
          </span>
        </div>

        <div className="bg-[#151a24] p-3 rounded-xl border border-[#242c3d]">
          <span className="text-[10px] text-[#64748b] font-bold uppercase block mb-1">
            BID INCREMENTS
          </span>
          <span className="text-xs text-[#cbd5e1] font-mono">
            &lt;10: +0.5 | &lt;20: +1 | 20+: +2
          </span>
        </div>
      </div>
    </div>
  );
};

"use client";

import React from "react";
import { AuctionAnalytics } from "@/types";
import { formatCr } from "@/lib/utils";
import { Trophy, Users, ShoppingBag, DollarSign, RotateCcw } from "lucide-react";

export interface ResultSummaryProps {
  analytics: AuctionAnalytics;
}

export const ResultSummary: React.FC<ResultSummaryProps> = ({ analytics }) => {
  return (
    <div className="space-y-6">
      {/* Trophy Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-[#111915] via-[#0e121a] to-[#121622] border-2 border-[#00ff87]/30 p-6 sm:p-8 shadow-2xl relative overflow-hidden text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="relative z-10">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#00ff87] bg-[#00ff87]/15 px-3 py-1 rounded-full border border-[#00ff87]/30">
            AUCTION COMPLETE
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-[#f8fafc] tracking-tight mt-2">
            {analytics.auctionName}
          </h1>
          <p className="text-xs text-[#94a3b8] mt-1">
            Room Code: <strong className="font-mono text-[#cbd5e1]">{analytics.roomCode}</strong> • Official gavel closed
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-[#00ff87]/15 border border-[#00ff87]/30 flex items-center justify-center text-3xl shadow-[0_0_30px_rgba(0,255,135,0.25)]">
            🏆
          </div>
        </div>
      </div>

      {/* Aggregate Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
        <div className="bg-[#0e121a] p-4 rounded-2xl border border-[#242c3d]">
          <span className="text-[10px] text-[#64748b] font-bold uppercase flex items-center gap-1 mb-1">
            <Users className="w-3.5 h-3.5 text-blue-400" />
            TEAMS
          </span>
          <span className="text-2xl font-black font-mono text-[#f8fafc]">
            {analytics.totalTeams}
          </span>
        </div>

        <div className="bg-[#0e121a] p-4 rounded-2xl border border-[#242c3d]">
          <span className="text-[10px] text-[#64748b] font-bold uppercase flex items-center gap-1 mb-1">
            <ShoppingBag className="w-3.5 h-3.5 text-[#00ff87]" />
            PLAYERS SOLD
          </span>
          <span className="text-2xl font-black font-mono text-[#00ff87]">
            {analytics.playersSold}
          </span>
        </div>

        <div className="bg-[#0e121a] p-4 rounded-2xl border border-[#242c3d]">
          <span className="text-[10px] text-[#64748b] font-bold uppercase flex items-center gap-1 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-amber-400" />
            TOTAL PURSE SPENT
          </span>
          <span className="text-2xl font-black font-mono text-amber-400">
            {formatCr(analytics.totalSpend)}
          </span>
        </div>

        <div className="bg-[#0e121a] p-4 rounded-2xl border border-[#242c3d]">
          <span className="text-[10px] text-[#64748b] font-bold uppercase flex items-center gap-1 mb-1">
            <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
            UNSOLD PLAYERS
          </span>
          <span className="text-2xl font-black font-mono text-[#ef4444]">
            {analytics.unsoldPlayers}
          </span>
        </div>

        <div className="bg-[#0e121a] p-4 rounded-2xl border border-[#242c3d] col-span-2 sm:col-span-1">
          <span className="text-[10px] text-[#64748b] font-bold uppercase flex items-center gap-1 mb-1">
            <Trophy className="w-3.5 h-3.5 text-purple-400" />
            AVERAGE SALE
          </span>
          <span className="text-2xl font-black font-mono text-[#f8fafc]">
            {formatCr(analytics.averageSale)}
          </span>
        </div>
      </div>
    </div>
  );
};

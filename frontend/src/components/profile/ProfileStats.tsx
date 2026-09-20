"use client";

import React from "react";
import { UserCareerStats } from "@/types";
import { formatCr } from "@/lib/utils";
import { Trophy, ShoppingBag, DollarSign, Award, Users, Flame } from "lucide-react";

export interface ProfileStatsProps {
  stats: UserCareerStats;
}

export const ProfileStats: React.FC<ProfileStatsProps> = ({ stats }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">
        CAREER AUCTION STATISTICS
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
        <div className="bg-[#0e121a] p-4 rounded-2xl border border-[#242c3d]">
          <span className="text-[10px] text-[#64748b] font-bold uppercase flex items-center gap-1 mb-1">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            AUCTIONS WON
          </span>
          <span className="text-2xl font-black font-mono text-[#00ff87]">
            {stats.auctionsWon ?? "—"}
          </span>
          <p className="text-[10px] text-[#64748b] mt-0.5">
            Out of {stats.auctionsPlayed} total played
          </p>
        </div>

        <div className="bg-[#0e121a] p-4 rounded-2xl border border-[#242c3d]">
          <span className="text-[10px] text-[#64748b] font-bold uppercase flex items-center gap-1 mb-1">
            <ShoppingBag className="w-3.5 h-3.5 text-blue-400" />
            PLAYERS SIGNED
          </span>
          <span className="text-2xl font-black font-mono text-[#f8fafc]">
            {stats.playersPurchased}
          </span>
          <p className="text-[10px] text-[#64748b] mt-0.5">Successful bids won</p>
        </div>

        <div className="bg-[#0e121a] p-4 rounded-2xl border border-[#242c3d]">
          <span className="text-[10px] text-[#64748b] font-bold uppercase flex items-center gap-1 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-[#00ff87]" />
            TOTAL PURSE SPENT
          </span>
          <span className="text-2xl font-black font-mono text-amber-400">
            {formatCr(stats.totalSpend)}
          </span>
          <p className="text-[10px] text-[#64748b] mt-0.5">Across all auction rooms</p>
        </div>

        <div className="bg-[#0e121a] p-4 rounded-2xl border border-[#242c3d]">
          <span className="text-[10px] text-[#64748b] font-bold uppercase flex items-center gap-1 mb-1">
            <Award className="w-3.5 h-3.5 text-purple-400" />
            AVERAGE SIGNING
          </span>
          <span className="text-2xl font-black font-mono text-[#f8fafc]">
            {formatCr(stats.averagePurchase)}
          </span>
          <p className="text-[10px] text-[#64748b] mt-0.5">Per acquired player</p>
        </div>

        <div className="bg-[#0e121a] p-4 rounded-2xl border border-[#242c3d] col-span-2 sm:col-span-1">
          <span className="text-[10px] text-[#64748b] font-bold uppercase flex items-center gap-1 mb-1">
            <Users className="w-3.5 h-3.5 text-sky-400" />
            ROOMS HOSTED
          </span>
          <span className="text-2xl font-black font-mono text-[#f8fafc]">
            {stats.roomsHosted}
          </span>
          <p className="text-[10px] text-[#64748b] mt-0.5">Auctioneer sessions</p>
        </div>

        <div className="bg-[#0e121a] p-4 rounded-2xl border border-[#242c3d] col-span-2 sm:col-span-2 lg:col-span-3">
          <span className="text-[10px] text-[#64748b] font-bold uppercase flex items-center gap-1 mb-1">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            RECORD PURCHASE
          </span>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mt-1">
            <div>
              <span className="text-base font-extrabold text-[#f8fafc]">
                {stats.highestPurchase?.playerName ?? "No purchases yet"}
              </span>
              <p className="text-[10px] text-[#64748b]">
                {stats.highestPurchase?.auctionName} • {stats.highestPurchase?.date}
              </p>
            </div>
            <span className="text-xl font-black font-mono text-[#00ff87]">
              {stats.highestPurchase ? formatCr(stats.highestPurchase.price) : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

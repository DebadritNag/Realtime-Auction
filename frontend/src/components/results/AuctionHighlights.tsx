"use client";

import React from "react";
import { AuctionAnalytics } from "@/types";
import { formatCr } from "@/lib/utils";
import { Sparkles, Flame, DollarSign, Swords, ShoppingBag, Shield } from "lucide-react";

export interface AuctionHighlightsProps {
  analytics: AuctionAnalytics;
}

export const AuctionHighlights: React.FC<AuctionHighlightsProps> = ({
  analytics,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[#00ff87]" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">
          DATA-DRIVEN AUCTION HIGHLIGHTS
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Most Expensive Player */}
        {analytics.mostExpensivePlayer && (
          <div className="rounded-2xl bg-[#0e121a] border border-[#242c3d] p-5 shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-2">
              <span className="flex items-center gap-1">
                <Flame className="w-3.5 h-3.5" /> MOST EXPENSIVE PLAYER
              </span>
              <span className="font-mono">{formatCr(analytics.mostExpensivePlayer.price)}</span>
            </div>
            <h4 className="text-xl font-black text-[#f8fafc] uppercase tracking-wide truncate">
              {analytics.mostExpensivePlayer.player.name}
            </h4>
            <p className="text-xs text-[#94a3b8] mt-1">
              Signed by <strong className="text-[#f8fafc]">{analytics.mostExpensivePlayer.boughtByTeam}</strong>
            </p>
          </div>
        )}

        {/* Biggest Spender Team */}
        {analytics.biggestSpenderTeam && (
          <div className="rounded-2xl bg-[#0e121a] border border-[#242c3d] p-5 shadow-lg">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#00ff87] mb-2">
              <span className="flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" /> BIGGEST SPENDER
              </span>
              <span className="font-mono">{formatCr(analytics.biggestSpenderTeam.totalSpent)}</span>
            </div>
            <h4 className="text-xl font-black text-[#f8fafc] uppercase tracking-wide truncate">
              {analytics.biggestSpenderTeam.teamName}
            </h4>
            <p className="text-xs text-[#94a3b8] mt-1">Highest total investment of the session</p>
          </div>
        )}

        {/* Longest Bidding War */}
        {analytics.longestBiddingWar && (
          <div className="rounded-2xl bg-[#0e121a] border border-[#242c3d] p-5 shadow-lg">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-rose-400 mb-2">
              <span className="flex items-center gap-1">
                <Swords className="w-3.5 h-3.5" /> LONGEST BIDDING WAR
              </span>
              <span className="font-mono">{analytics.longestBiddingWar.totalBids} Bids</span>
            </div>
            <h4 className="text-xl font-black text-[#f8fafc] uppercase tracking-wide truncate">
              {analytics.longestBiddingWar.player.name}
            </h4>
            <p className="text-xs text-[#94a3b8] mt-1">
              Final hammer at <strong className="font-mono text-white">{formatCr(analytics.longestBiddingWar.finalPrice)}</strong>
            </p>
          </div>
        )}

        {/* Most Players Purchased */}
        {analytics.mostPlayersPurchased && (
          <div className="rounded-2xl bg-[#0e121a] border border-[#242c3d] p-5 shadow-lg">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-2">
              <span className="flex items-center gap-1">
                <ShoppingBag className="w-3.5 h-3.5" /> MOST PLAYERS SIGNED
              </span>
              <span className="font-mono">{analytics.mostPlayersPurchased.count} Signings</span>
            </div>
            <h4 className="text-xl font-black text-[#f8fafc] uppercase tracking-wide truncate">
              {analytics.mostPlayersPurchased.teamName}
            </h4>
            <p className="text-xs text-[#94a3b8] mt-1">Widest roster acquisition</p>
          </div>
        )}

        {/* Highest Remaining Budget */}
        {analytics.highestRemainingBudget && (
          <div className="rounded-2xl bg-[#0e121a] border border-[#242c3d] p-5 shadow-lg sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-2">
              <span className="flex items-center gap-1">
                <Shield className="w-3.5 h-3.5" /> MOST LEFTOVER PURSE
              </span>
              <span className="font-mono">{formatCr(analytics.highestRemainingBudget.budget)}</span>
            </div>
            <h4 className="text-xl font-black text-[#f8fafc] uppercase tracking-wide truncate">
              {analytics.highestRemainingBudget.teamName}
            </h4>
            <p className="text-xs text-[#94a3b8] mt-1">Reserved capital for mid-season</p>
          </div>
        )}
      </div>
    </div>
  );
};

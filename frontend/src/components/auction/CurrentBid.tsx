"use client";

import React from "react";
import { Team } from "@/types";
import { formatCr } from "@/lib/utils";
import { Flame, User } from "lucide-react";

export interface CurrentBidProps {
  currentBid: number;
  highestBidder: Team | null;
  currentTeamId?: string | null;
}

export const CurrentBid: React.FC<CurrentBidProps> = ({
  currentBid,
  highestBidder,
  currentTeamId,
}) => {
  const isUserLeading =
    highestBidder &&
    (highestBidder.id === currentTeamId || highestBidder.isCurrentUser);

  return (
    <div className="auction-current-bid w-full rounded-2xl bg-[#0e121a] border border-[#242c3d] p-4 text-center relative overflow-hidden shadow-lg">
      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1">
        <span className="flex items-center gap-1.5">
          <Flame className="w-3.5 h-3.5 text-amber-400" />
          CURRENT BID
        </span>
        {isUserLeading ? (
          <span className="text-[#00ff87] bg-[#00ff87]/15 border border-[#00ff87]/30 px-2 py-0.5 rounded text-[10px] font-black">
            YOU ARE LEADING
          </span>
        ) : (
          <span className="text-[#94a3b8] text-[10px]">
            {highestBidder ? "ACTIVE BID" : "OPENING BID"}
          </span>
        )}
      </div>

      {/* Prominent Price Display */}
      <div className="my-1">
        <span className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-[#f8fafc] drop-shadow-md">
          {formatCr(currentBid)}
        </span>
      </div>

      {/* Leading Team Display */}
      <div className="mt-2 pt-2.5 border-t border-[#242c3d]/60 flex items-center justify-center gap-2 text-xs">
        {highestBidder ? (
          <div className="flex items-center gap-2">
            <span className="text-base">{highestBidder.logo}</span>
            <span className="font-bold text-[#f8fafc]">
              {highestBidder.name}
            </span>
            <span className="text-[#64748b] flex items-center gap-1 text-[11px]">
              <User className="w-3 h-3" />
              @{highestBidder.managerUsername}
            </span>
          </div>
        ) : (
          <span className="text-[#64748b] italic">No bids placed yet</span>
        )}
      </div>
    </div>
  );
};

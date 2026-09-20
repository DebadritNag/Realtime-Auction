"use client";

import React from "react";
import { Bid } from "@/types";
import { formatCr } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";

export interface BidFeedProps {
  bids: Bid[];
}

export const BidFeed: React.FC<BidFeedProps> = ({ bids }) => {
  return (
    <div className="w-full rounded-2xl bg-[#0e121a] border border-[#242c3d] p-3 text-[#f8fafc]">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#242c3d]/60 text-[10px] font-bold uppercase tracking-wider text-[#64748b]">
        <span>LIVE BID LOG</span>
        <span>{bids.length} BIDS RECORDED</span>
      </div>

      {bids.length === 0 ? (
        <p className="text-center text-xs text-[#64748b] py-3">
          Awaiting opening bid for this player.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
          {bids.map((bid, index) => (
            <div
              key={bid.id}
              className={`flex items-center justify-between p-2 rounded-lg text-xs font-mono transition-all ${
                index === 0
                  ? "bg-[#00ff87]/10 border border-[#00ff87]/30 text-[#f8fafc]"
                  : "bg-[#151a24] border border-[#242c3d]/40 text-[#94a3b8]"
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <ArrowUpRight
                  className={`w-3.5 h-3.5 shrink-0 ${
                    index === 0 ? "text-[#00ff87]" : "text-[#64748b]"
                  }`}
                />
                <span className="text-sm shrink-0">{bid.teamLogo}</span>
                <span className="font-bold truncate text-[#f8fafc]">
                  {bid.teamName}
                </span>
                <span className="text-[10px] text-[#64748b] hidden sm:inline truncate">
                  (@{bid.bidderUsername})
                </span>
              </div>

              <span
                className={`font-black tabular-nums text-xs shrink-0 ml-2 ${
                  index === 0 ? "text-[#00ff87]" : "text-amber-400"
                }`}
              >
                {formatCr(bid.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

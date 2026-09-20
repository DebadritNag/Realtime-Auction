"use client";

import React from "react";
import Link from "next/link";

import type { AuctionHistoryRecord } from "@/types";

export const RecentActivityCard: React.FC<{history: AuctionHistoryRecord[]}> = ({history}) => {
  return (
    <div className="h-full min-h-[290px] sm:min-h-[300px] rounded-2xl border border-[#122e42] bg-[#051521] p-5 sm:p-6 flex flex-col justify-between group transition-all hover:border-[#00F59B]/30">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[#0f283a]">
          <div className="flex items-center space-x-2.5">
            <svg
              className="w-4 h-4 text-[#7A93A7]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 6v6l4 2"></path>
            </svg>
            <h4 className="text-[16px] font-extrabold text-white">Recent Activity</h4>
          </div>

          <Link
            href="/profile#history"
            className="text-[11.5px] text-[#00F59B] hover:underline font-semibold flex items-center"
          >
            <span>View All</span>
            <span className="ml-0.5">↗</span>
          </Link>
        </div>

        {/* Feed Items */}
        <div className="space-y-3 mt-4">
          {history.length === 0 && <p className="text-sm text-[#6E8597]">Your auction activity will appear here.</p>}
          {history.slice(0, 4).map(item => <Link key={item.id}
            href={item.status === 'COMPLETED' ? '/results/' + item.roomCode : '/room/' + item.roomCode}
            className="flex items-center justify-between p-2 rounded-xl hover:bg-[#092230]">
            <div><p className="text-sm font-bold text-white">{item.auctionName}</p>
            <p className="text-xs text-[#6E8597]">{item.teamUsed} · {item.date}</p></div>
            <span className="text-xs text-[#00F59B]">{item.status}</span>
          </Link>)}

        </div>
      </div>
    </div>
  );
};

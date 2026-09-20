"use client";

import React from "react";
import Link from "next/link";

export const RecentActivityCard: React.FC = () => {
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
          {/* Feed Item 1 (Live) */}
          <Link
            href="/auction/PREM-2026"
            className="flex items-center justify-between p-2 -mx-2 rounded-xl hover:bg-[#092230] transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-sm text-amber-400 shrink-0 shadow-inner">
                🔨
              </div>
              <div>
                <p className="text-[12px] font-bold text-white group-hover:text-[#00F59B] transition-colors leading-tight">
                  Joined PREM-2026 Derby
                </p>
                <p className="text-[10px] text-[#6E8597] mt-0.5">Today, 7:14 PM</p>
              </div>
            </div>
            <span className="text-[9.5px] font-extrabold text-[#00F59B] bg-[#00F59B]/10 border border-[#00F59B]/30 px-2.5 py-0.5 rounded">
              LIVE
            </span>
          </Link>

          {/* Feed Item 2 */}
          <div className="flex items-center justify-between p-2 -mx-2 rounded-xl hover:bg-[#092230] transition-colors">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-sm text-[#00F59B] shrink-0 shadow-inner">
                👥
              </div>
              <div>
                <p className="text-[12px] font-bold text-white leading-tight">
                  Created auction room
                </p>
                <p className="text-[10px] text-[#6E8597] mt-0.5">Tactical Titans</p>
              </div>
            </div>
            <span className="text-[10px] text-[#6E8597]">2 days ago</span>
          </div>

          {/* Feed Item 3 */}
          <Link
            href="/results/PREM-2026"
            className="flex items-center justify-between p-2 -mx-2 rounded-xl hover:bg-[#092230] transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-sm text-yellow-400 shrink-0 shadow-inner">
                🏆
              </div>
              <div>
                <p className="text-[12px] font-bold text-white group-hover:text-[#00F59B] transition-colors leading-tight">
                  Won auction
                </p>
                <p className="text-[10px] text-[#6E8597] mt-0.5">Bengal Rivalry League</p>
              </div>
            </div>
            <span className="text-[10px] text-[#6E8597]">5 days ago</span>
          </Link>

          {/* Feed Item 4 */}
          <div className="flex items-center justify-between p-2 -mx-2 rounded-xl hover:bg-[#092230] transition-colors">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sm text-sky-400 shrink-0 shadow-inner">
                👤
              </div>
              <div>
                <p className="text-[12px] font-bold text-white leading-tight">
                  Added player to watchlist
                </p>
                <p className="text-[10px] text-[#6E8597] mt-0.5">Erling Haaland</p>
              </div>
            </div>
            <span className="text-[10px] text-[#6E8597]">6 days ago</span>
          </div>
        </div>
      </div>
    </div>
  );
};

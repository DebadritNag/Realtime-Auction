"use client";

import React from "react";
import Link from "next/link";
import { User, UserCareerStats } from "@/types";

export interface ProfilePreviewProps {
  user: User;
  stats?: UserCareerStats;
}

export const ProfilePreview: React.FC<ProfilePreviewProps> = ({
  user,
  stats,
}) => {
  const initials = user.displayName
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "GC";

  const auctionsWon = stats?.auctionsWon ?? "—";
  const auctionsPlayed = stats?.auctionsPlayed ?? "—";
  const careerSpend = stats?.totalSpend.toFixed(1) ?? "—";

  return (
    <div className="h-full min-h-[290px] sm:min-h-[300px] rounded-2xl border border-[#122e42] bg-[#051521] p-5 sm:p-6 flex flex-col justify-between group transition-all hover:border-[#00F59B]/30">
      <div>
        {/* Header Profile Item */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[#0f283a]">
          <div className="flex items-center space-x-3.5">
            <div className="w-13 h-13 rounded-full border-2 border-[#00F59B] overflow-hidden bg-[#072436] flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(0,245,155,0.2)]">
              <span className="text-base font-black text-[#00F59B]">{initials}</span>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-[#7991A5]">
                Your Manager Profile
              </p>
              <h4 className="text-[17px] font-black text-white leading-tight">
                {user.displayName || user.username}
              </h4>
              <p className="text-[11.5px] text-[#00F59B] flex items-center space-x-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00F59B] inline-block animate-pulse"></span>
                <span>@{user.username}</span>
              </p>
            </div>
          </div>

          <Link
            href="/profile"
            className="px-3 py-1.5 rounded-md bg-[#0a2333] border border-[#193b53] hover:border-[#00F59B]/50 text-[11.5px] font-semibold text-[#A9BCCE] hover:text-white flex items-center space-x-1.5 transition"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
            </svg>
            <span>Edit Profile</span>
          </Link>
        </div>

        {/* 3 Stat Tiles */}
        <div className="grid grid-cols-3 gap-2.5 mt-4">
          {/* Stat 1 */}
          <div className="bg-[#030d14] p-3 rounded-xl border border-[#0f2a3c] flex flex-col justify-between">
            <span className="text-[9.5px] font-semibold text-[#738a9d] block">
              Default Franchise
            </span>
            <div className="flex items-center space-x-1.5 mt-1.5">
              <span className="text-sm">{user.defaultTeamLogo || "🛡️"}</span>
              <span className="text-[12px] font-bold text-white truncate">
                {user.defaultTeamName || "Not set"}
              </span>
            </div>
          </div>

          {/* Stat 2 */}
          <div className="bg-[#030d14] p-3 rounded-xl border border-[#0f2a3c] flex flex-col justify-between">
            <span className="text-[9.5px] font-semibold text-[#738a9d] block">
              Auctions Won
            </span>
            <div className="flex items-center space-x-1.5 mt-1.5">
              <span className="text-sm">🏆</span>
              <span className="text-[13px] font-black text-white">
                <span className="text-[#00F59B]">{auctionsWon}</span> / {auctionsPlayed}
              </span>
            </div>
          </div>

          {/* Stat 3 */}
          <div className="bg-[#030d14] p-3 rounded-xl border border-[#0f2a3c] flex flex-col justify-between">
            <span className="text-[9.5px] font-semibold text-[#738a9d] block">
              Career Spend
            </span>
            <div className="flex items-center space-x-1.5 mt-1.5">
              <span className="text-sm">🪙</span>
              <span className="text-[13px] font-black text-[#FFD700]">
                ₹{careerSpend} Cr
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Footer with Quote & Sparkline */}
      <div className="mt-4 pt-3.5 border-t border-[#0e2638] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-sm text-[#00F59B] font-serif">“</span>
          <p className="text-[11px] italic text-[#9BB1C4]">Same game. Smarter managers.</p>
        </div>

      </div>
    </div>
  );
};

"use client";

import React from "react";
import Link from "next/link";
import { Achievement } from "@/types";

export interface AchievementPreviewProps {
  achievements: Achievement[];
}

export const AchievementPreview: React.FC<AchievementPreviewProps> = ({
  achievements,
}) => {
  const total = achievements.length > 0 ? achievements.length : 8;
  const unlocked = achievements.length > 0
    ? achievements.filter((a) => a.unlocked).length
    : 7;
  const progressPercent = Math.round((unlocked / total) * 100);

  // Default badges from HTML design with styles
  const defaultBadges = [
    {
      id: "first_signing",
      icon: "🏆",
      title: "First Signing",
      description: "Complete your first successful player purchase in any auction room.",
      borderColor: "border-amber-500/30",
      iconBg: "bg-amber-400/10",
      textColor: "text-amber-300",
      pillBg: "bg-amber-400/10 border-amber-400/30",
      unlocked: true,
    },
    {
      id: "auction_rookie",
      icon: "🎖️",
      title: "Auction Rookie",
      description: "Successfully complete your first full auction room.",
      borderColor: "border-sky-500/30",
      iconBg: "bg-sky-400/10",
      textColor: "text-sky-300",
      pillBg: "bg-sky-400/10 border-sky-400/30",
      unlocked: true,
    },
    {
      id: "big_spender",
      icon: "💰",
      title: "Big Spender",
      description: "Spend 100 Cr+ in a single auction session.",
      borderColor: "border-emerald-500/30",
      iconBg: "bg-emerald-400/10",
      textColor: "text-[#00F59B]",
      pillBg: "bg-[#00F59B]/10 border-[#00F59B]/30",
      unlocked: true,
    },
    {
      id: "bargain_hunter",
      icon: "🎯",
      title: "Bargain Hunter",
      description: "Win a 87+ OVR world-class player for under 15 Cr.",
      borderColor: "border-purple-500/30",
      iconBg: "bg-purple-400/10",
      textColor: "text-purple-300",
      pillBg: "bg-purple-400/10 border-purple-400/30",
      unlocked: true,
    },
  ];

  // If real achievements exist, merge unlock state
  const badgesToRender = defaultBadges.map((badge) => {
    const found = achievements.find((a) => a.id === badge.id);
    if (found) {
      return {
        ...badge,
        unlocked: found.unlocked,
      };
    }
    return badge;
  });

  return (
    <div className="h-full min-h-[290px] sm:min-h-[300px] rounded-2xl border border-[#122e42] bg-[#051521] p-5 sm:p-6 flex flex-col justify-between group transition-all hover:border-[#00F59B]/30">
      <div>
        {/* Header with Progress */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[#0f283a]">
          <div className="flex items-center space-x-2">
            <span className="text-[#FFD700] text-base">⭐</span>
            <h4 className="text-[16px] font-extrabold text-white">Achievements</h4>
          </div>

          <div className="flex items-center space-x-3.5">
            <div className="flex items-center space-x-2">
              <span className="text-[12px] font-black text-[#00F59B]">
                {unlocked} / {total} Unlocked
              </span>
              <div className="w-20 h-2 bg-[#0e2738] rounded-full overflow-hidden">
                <div
                  className="bg-[#00F59B] h-full rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>

            <Link
              href="/profile#achievements"
              className="text-[11.5px] text-[#00F59B] hover:underline font-semibold flex items-center"
            >
              <span>View All</span>
              <span className="ml-0.5">↗</span>
            </Link>
          </div>
        </div>

        {/* 4 Achievement Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
          {badgesToRender.map((badge) => (
            <div
              key={badge.id}
              className={`bg-[#030d14] border ${badge.borderColor} rounded-xl p-3 flex flex-col items-center text-center justify-between min-h-[160px] transition-all hover:scale-[1.03] shadow-md`}
            >
              <div
                className={`w-11 h-11 rounded-full ${badge.iconBg} flex items-center justify-center text-2xl shrink-0 shadow-inner`}
              >
                {badge.icon}
              </div>

              <div className="my-1.5">
                <h5 className="text-[11.5px] font-extrabold text-white mt-1 leading-tight">
                  {badge.title}
                </h5>
                <p className="text-[9.5px] text-[#788e9f] mt-1 leading-tight line-clamp-3">
                  {badge.description}
                </p>
              </div>

              {badge.unlocked ? (
                <span
                  className={`mt-2 text-[9px] font-bold ${badge.textColor} ${badge.pillBg} border px-2 py-1 rounded-full w-full`}
                >
                  ✓ UNLOCKED
                </span>
              ) : (
                <span className="mt-2 text-[9px] font-bold text-[#64748b] bg-[#121620] border border-[#242c3d] px-2 py-1 rounded-full w-full">
                  🔒 LOCKED
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

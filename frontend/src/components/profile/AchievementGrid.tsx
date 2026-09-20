"use client";

import React from "react";
import { Achievement } from "@/types";
import { Lock, Award } from "lucide-react";

export interface AchievementGridProps {
  achievements: Achievement[];
}

export const AchievementGrid: React.FC<AchievementGridProps> = ({
  achievements,
}) => {
  return (
    <div id="achievements" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#94a3b8] flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-400" />
          ALL ACHIEVEMENTS & MILESTONES
        </h3>
        <span className="text-xs font-mono text-[#64748b]">
          {achievements.filter((a) => a.unlocked).length} / {achievements.length} UNLOCKED
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {achievements.map((item) => (
          <div
            key={item.id}
            className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
              item.unlocked
                ? "bg-[#0e121a] border-amber-500/30 text-[#f8fafc] shadow-[0_0_20px_rgba(245,158,11,0.08)]"
                : "bg-[#090b10] border-[#242c3d]/50 text-[#64748b] opacity-60"
            }`}
          >
            <div>
              <div className="text-3xl mb-2">{item.icon}</div>
              <h4 className="font-extrabold text-xs uppercase tracking-tight">
                {item.title}
              </h4>
              <p className="text-xs text-[#94a3b8] mt-1 leading-relaxed">
                {item.description}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-[#242c3d]/40 flex items-center justify-between text-[10px]">
              {item.unlocked ? (
                <>
                  <span className="font-bold text-amber-400 uppercase">UNLOCKED</span>
                  <span className="text-[#64748b] font-mono">{item.unlockedAt}</span>
                </>
              ) : (
                <span className="font-bold text-[#64748b] uppercase flex items-center gap-1">
                  <Lock className="w-3 h-3" /> LOCKED
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

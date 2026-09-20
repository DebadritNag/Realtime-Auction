"use client";

import React from "react";
import { useAuctionTimer } from "@/hooks/useAuctionTimer";
import { Timer } from "lucide-react";
import { formatTimeSeconds } from "@/lib/utils";

export interface AuctionTimerProps {
  endsAt: number | null;
  serverTimeOffset?: number;
  isPaused?: boolean;
  remainingTimeMs?: number | null;
  synced?: boolean;
}

export const AuctionTimer: React.FC<AuctionTimerProps> = ({
  endsAt,
  serverTimeOffset = 0,
  isPaused = false,
  remainingTimeMs = null, synced = false,
}) => {
  const {seconds, resolving} = useAuctionTimer(endsAt, serverTimeOffset, isPaused, remainingTimeMs, synced);
  const isUrgent = seconds <= 5 && seconds > 0;
  const isExpired = seconds === 0 && endsAt !== null;

  return (
    <div
      className={`auction-timer rounded-2xl border transition-all duration-300 p-4 text-center ${
        isUrgent
          ? "bg-red-950/30 border-red-500 animate-timer-urgency"
          : isExpired
          ? "bg-amber-950/20 border-amber-500/40"
          : "bg-[#0e121a] border-[#242c3d]"
      }`}
    >
      <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#94a3b8] mb-0.5">
        <Timer className={`w-3.5 h-3.5 ${isUrgent ? "text-[#ef4444]" : "text-[#00ff87]"}`} />
        <span>{isPaused ? "AUCTION PAUSED" : "TIME REMAINING"}</span>
      </div>

      <div className="flex items-baseline justify-center gap-1.5">
        <span
          className={`text-4xl sm:text-5xl font-black font-mono tabular-nums tracking-tighter ${
            isUrgent
              ? "text-[#ef4444]"
              : isExpired
              ? "text-amber-400"
              : "text-[#f8fafc]"
          }`}
        >
          {!synced || !endsAt ? "--" : formatTimeSeconds(seconds)}
        </span>
        <span className="text-xs font-bold uppercase text-[#64748b]">SEC</span>
      </div>

      {resolving && <p className="text-xs text-amber-400">Resolving…</p>}
      {isUrgent && synced && !isPaused && (
        <p className="text-[10px] font-bold text-[#ef4444] uppercase tracking-wider mt-1 animate-pulse">
          FINAL SECONDS!
        </p>
      )}
    </div>
  );
};

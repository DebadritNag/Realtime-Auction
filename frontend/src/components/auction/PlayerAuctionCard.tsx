"use client";

import React from "react";
import { Player } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { formatCr } from "@/lib/utils";
import { Shield, Sparkles } from "lucide-react";

export interface PlayerAuctionCardProps {
  player: Player | null;
}

export const PlayerAuctionCard: React.FC<PlayerAuctionCardProps> = ({ player }) => {
  if (!player) {
    return (
      <div className="w-full aspect-[4/5] max-w-sm mx-auto rounded-3xl bg-[#0e121a] border border-[#242c3d] flex flex-col items-center justify-center p-6 text-center text-[#64748b]">
        <Shield className="w-12 h-12 mb-3 opacity-40 animate-pulse" />
        <p className="text-sm font-semibold">Waiting for next player...</p>
      </div>
    );
  }

  const isElite = player.ovr >= 90;

  const statList = [
    { label: "PAC", value: player.stats.pac },
    { label: "SHO", value: player.stats.sho },
    { label: "PAS", value: player.stats.pas },
    { label: "DRI", value: player.stats.dri },
    { label: "DEF", value: player.stats.def },
    { label: "PHY", value: player.stats.phy },
  ];

  return (
    <div className="relative w-full max-w-md mx-auto select-none">
      {/* Stadium Spotlight Glow behind card */}
      <div
        className={`absolute -inset-1 rounded-[2rem] blur-xl opacity-40 transition-all ${
          isElite ? "bg-[#f59e0b]/30" : "bg-[#00ff87]/20"
        }`}
      />

      {/* Main Card Frame */}
      <div className="relative overflow-hidden rounded-[1.8rem] bg-gradient-to-b from-[#161c28] via-[#0f131d] to-[#0a0c12] border-2 border-[#2b354c] shadow-2xl p-6 text-[#f8fafc]">
        {/* Pitch Line / Radial stadium texture */}
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_50%_20%,_rgba(0,255,135,0.25)_0%,_transparent_70%)]" />

        {/* Top Card Header: OVR + Position Badge + Nationality + Club */}
        <div className="flex items-start justify-between relative z-10">
          <div className="flex flex-col items-center">
            <span
              className={`text-5xl font-black tracking-tighter tabular-nums ${
                isElite ? "text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.4)]" : "text-[#00ff87]"
              }`}
            >
              {player.ovr}
            </span>
            <Badge
              variant="position"
              position={player.position}
              className="mt-0.5 text-xs font-mono font-bold"
            >
              {player.subPosition || player.position}
            </Badge>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2 bg-[#0a0d14]/80 px-2.5 py-1 rounded-full border border-[#242c3d]">
              <span className="text-base leading-none">{player.flagEmoji}</span>
              <span className="text-[11px] font-semibold text-[#cbd5e1]">
                {player.nationality}
              </span>
            </div>
            <span className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-wider">
              {player.club}
            </span>
          </div>
        </div>

        {/* Player Visual Graphic - Original Football Avatar with Hologram Spotlight */}
        <div className="relative my-3 flex flex-col items-center justify-center">
          <div className="relative w-36 h-36 rounded-full bg-gradient-to-b from-[#1e2536] to-[#0e121a] border border-[#37435e] flex items-center justify-center shadow-inner overflow-hidden">
            <div className="text-5xl select-none filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]">
              {player.position === "GK"
                ? "🧤"
                : player.position === "ATT"
                ? "⚡"
                : player.position === "MID"
                ? "🎯"
                : "🛡️"}
            </div>
            {/* Hologram sheen */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />
          </div>

          {/* Tier badge */}
          {isElite && (
            <div className="absolute -bottom-2 flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shadow-lg">
              <Sparkles className="w-3 h-3" />
              ELITE TIER
            </div>
          )}
        </div>

        {/* Player Name and Quick Attributes */}
        <div className="text-center relative z-10 mt-4 mb-3">
          <h2 className="text-2xl font-black uppercase tracking-wide text-[#f8fafc] truncate">
            {player.name}
          </h2>
          <div className="flex items-center justify-center gap-3 text-[11px] text-[#94a3b8] mt-0.5">
            <span>Age: <strong className="text-[#f8fafc]">{player.age ?? "—"}</strong></span>
            <span>•</span>
            <span>Foot: <strong className="text-[#f8fafc]">{player.preferredFoot ?? "—"}</strong></span>
            <span>•</span>
            <span>Base: <strong className="text-[#00ff87] font-mono">{formatCr(player.basePrice)}</strong></span>
          </div>
        </div>

        {/* 6 Original Player Stats Grid (PAC, SHO, PAS, DRI, DEF, PHY) */}
        <div className="grid grid-cols-6 gap-1.5 pt-3 border-t border-[#242c3d]/70 relative z-10">
          {statList.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center bg-[#080a0f]/60 rounded-lg py-1.5 px-1 border border-[#1e2536]"
            >
              <span className="text-[10px] font-extrabold text-[#64748b]">
                {stat.label}
              </span>
              <span
                className={`text-sm font-bold font-mono tabular-nums ${
                  (stat.value ?? 0) >= 88
                    ? "text-[#00ff87]"
                    : stat.value >= 80
                    ? "text-[#f8fafc]"
                    : "text-[#94a3b8]"
                }`}
              >
                {stat.value ?? "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

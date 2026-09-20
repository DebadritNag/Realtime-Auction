"use client";

import React from "react";
import { SoldOverlayState } from "@/stores/auction.store";
import { formatCr } from "@/lib/utils";
import { Check, Sparkles } from "lucide-react";

export interface SoldOverlayProps {
  soldData: SoldOverlayState;
  onDismiss: () => void;
}

export const SoldOverlay: React.FC<SoldOverlayProps> = ({
  soldData,
  onDismiss,
}) => {
  if (!soldData.active || !soldData.player || !soldData.winningTeam) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Dark backdrop with stadium green ambient glow */}
      <div
        className="fixed inset-0 bg-[#08090d]/90 backdrop-blur-md transition-opacity"
        onClick={onDismiss}
      />

      <div className="relative z-10 w-full max-w-md rounded-3xl bg-gradient-to-b from-[#18221c] via-[#0f1412] to-[#08090d] border-2 border-[#00ff87]/60 p-7 text-center shadow-[0_0_80px_rgba(0,255,135,0.25)] animate-notice overflow-hidden">
        {/* Pitch light burst */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-[#00ff87]/20 rounded-full blur-3xl pointer-events-none" />

        {/* SOLD Rubber Stamp Effect */}
        <div className="inline-block mb-3 animate-stamp">
          <div className="px-5 py-1.5 rounded-lg border-4 border-[#00ff87] text-[#00ff87] font-black text-3xl sm:text-4xl tracking-widest uppercase shadow-[0_0_30px_rgba(0,255,135,0.4)] rotate-[-6deg]">
            SOLD!
          </div>
        </div>

        {/* Player Name */}
        <h3 className="text-2xl sm:text-3xl font-black uppercase text-[#f8fafc] tracking-wide mt-2">
          {soldData.player.name}
        </h3>
        <p className="text-xs text-[#94a3b8] mt-0.5">
          {soldData.player.club} • {soldData.player.ovr} OVR {soldData.player.position}
        </p>

        {/* Winning Team & Final Transfer Price */}
        <div className="my-5 p-4 rounded-2xl bg-[#080a0f]/80 border border-[#242c3d]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748b] block mb-1">
            ACQUIRED BY
          </span>
          <div className="flex items-center justify-center gap-2 text-lg font-black text-[#f8fafc]">
            <span className="text-2xl">{soldData.winningTeam.logo}</span>
            <span>{soldData.winningTeam.name}</span>
          </div>

          <div className="mt-3 pt-3 border-t border-[#242c3d]/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748b] block mb-0.5">
              FINAL TRANSFER PRICE
            </span>
            <span className="text-3xl sm:text-4xl font-black font-mono text-[#00ff87] drop-shadow-md">
              {formatCr(soldData.price)}
            </span>
          </div>
        </div>

        {/* Transition notice */}
        <div className="flex items-center justify-center gap-2 text-xs text-[#94a3b8]">
          <Sparkles className="w-4 h-4 text-[#00ff87] animate-spin" />
          <span>Transitioning to next player in pot...</span>
        </div>
      </div>
    </div>
  );
};

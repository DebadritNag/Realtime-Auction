"use client";

import React from "react";
import { UnsoldOverlayState } from "@/stores/auction.store";
import { formatCr } from "@/lib/utils";
import { AlertCircle, RotateCcw } from "lucide-react";

export interface UnsoldOverlayProps {
  unsoldData: UnsoldOverlayState;
  onDismiss: () => void;
}

export const UnsoldOverlay: React.FC<UnsoldOverlayProps> = ({
  unsoldData,
  onDismiss,
}) => {
  if (!unsoldData.active || !unsoldData.player) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-[#08090d]/85 backdrop-blur-sm transition-opacity"
        onClick={onDismiss}
      />

      <div className="relative z-10 w-full max-w-sm rounded-3xl bg-[#0e121a] border border-[#37435e] p-6 text-center shadow-2xl animate-notice">
        {/* UNSOLD Rubber Stamp */}
        <div className="inline-block mb-2 animate-stamp">
          <div className="px-5 py-1.5 rounded-lg border-4 border-slate-500 text-slate-400 font-black text-3xl tracking-widest uppercase rotate-[-5deg]">
            UNSOLD
          </div>
        </div>

        <h3 className="text-xl font-black uppercase text-[#f8fafc] mt-2">
          {unsoldData.player.name}
        </h3>
        <p className="text-xs text-[#94a3b8] mt-0.5">
          Base Price: <strong className="font-mono text-white">{formatCr(unsoldData.player.basePrice)}</strong>
        </p>

        <div className="my-4 p-3 rounded-xl bg-[#151a24] border border-[#242c3d] flex items-center justify-center gap-2 text-xs text-amber-400">
          <RotateCcw className="w-4 h-4 shrink-0" />
          <span>Moved to Recall Pool ({unsoldData.recallCount} players)</span>
        </div>

        <p className="text-[11px] text-[#64748b]">
          Auction will continue with the next player shortly...
        </p>
      </div>
    </div>
  );
};

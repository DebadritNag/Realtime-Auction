"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Play, Settings2, Users } from "lucide-react";

export interface HostControlsProps {
  isHost: boolean;
  totalTeams: number;
  expectedTeams: number;
  onStartAuction: () => void;
  onEditSettings?: () => void;
  isStarting?: boolean;
  disabled?: boolean;
  /** When set, START is disabled and this reason is shown (e.g. retention not finalized). */
  startBlockedReason?: string | null;
}

export const HostControls: React.FC<HostControlsProps> = ({
  isHost,
  totalTeams,
  expectedTeams,
  onStartAuction,
  onEditSettings,
  isStarting = false,
  disabled = false,
  startBlockedReason = null,
}) => {
  if (!isHost) {
    return (
      <div className="rounded-2xl bg-[#0e121a] border border-[#242c3d] p-5 text-center shadow-lg">
        <div className="flex items-center justify-center gap-2 text-amber-400 mb-1">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
          <span className="text-xs font-black uppercase tracking-widest">
            WAITING FOR HOST
          </span>
        </div>
        <p className="text-xs text-[#94a3b8]">
          The host will initiate the live player auction when the required teams have joined.
        </p>
        {startBlockedReason ? (
          <p className="mt-1 text-xs text-amber-300" data-testid="start-blocked-reason">{startBlockedReason}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[#0e121a] border border-[#00ff87]/30 p-6 text-center shadow-[0_0_30px_rgba(0,255,135,0.08)] space-y-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black uppercase text-[#00ff87]">
              HOST COMMAND CONSOLE
            </span>
            <span className="text-xs text-[#64748b] font-mono">
              ({totalTeams} / {expectedTeams} Teams Joined)
            </span>
          </div>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            You are the auctioneer. When ready, launch the live bidding room.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {onEditSettings && (
            <Button
              variant="secondary"
              size="md"
              onClick={onEditSettings}
              leftIcon={<Settings2 className="w-4 h-4" />}
            >
              Settings
            </Button>
          )}

          <Button
            variant="stadium"
            size="lg"
            onClick={onStartAuction}
            isLoading={isStarting}
            disabled={disabled || Boolean(startBlockedReason)}
            aria-describedby={startBlockedReason ? "start-blocked-reason" : undefined}
            className="flex-1 sm:flex-initial px-7"
            leftIcon={<Play className="w-4 h-4 fill-current" />}
          >
            START LIVE AUCTION
          </Button>
        </div>
      </div>
      {startBlockedReason ? (
        <p id="start-blocked-reason" className="text-left text-xs text-amber-300" data-testid="start-blocked-reason">{startBlockedReason}</p>
      ) : null}
    </div>
  );
};

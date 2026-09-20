"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Play, Pause, SkipForward, Ban, Flag, RotateCcw } from "lucide-react";

export interface HostAuctionControlsProps {
  hasActivePlayer: boolean; hasBid: boolean; synced: boolean; canRecall: boolean; onRecall: () => void;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onEnd: () => void;
}

export const HostAuctionControls: React.FC<HostAuctionControlsProps> = ({
  hasActivePlayer, hasBid, synced, canRecall, onRecall,
  isPaused,
  onPause,
  onResume,
  onSkip,
  onEnd,
}) => {
  const [confirmSkipOpen, setConfirmSkipOpen] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);

  return (
    <div className="auction-host-controls flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#080a0f] border border-[#242c3d] text-xs">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-[#00ff87] bg-[#00ff87]/15 px-2 py-0.5 rounded border border-[#00ff87]/30">
          HOST CONTROLS
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {isPaused ? (
          <Button
            variant="stadium"
            size="sm"
            onClick={onResume}
            disabled={!synced}
            leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
          >
            Resume Auction
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={onPause}
            disabled={!synced}
            leftIcon={<Pause className="w-3.5 h-3.5" />}
          >
            Pause
          </Button>
        )}

        <Button
          variant="secondary"
          size="sm"
          onClick={() => hasActivePlayer ? setConfirmSkipOpen(true) : onSkip()}
          disabled={!synced || isPaused || hasBid}
          leftIcon={<SkipForward className="w-3.5 h-3.5" />}
        >
          {hasActivePlayer ? "Mark Unsold" : "Next Player"}
        </Button>

        {canRecall && <Button variant="secondary" size="sm" disabled={!synced || isPaused} onClick={onRecall}>Recall Unsold</Button>}
        <Button
          variant="danger"
          size="sm"
          onClick={() => setConfirmEndOpen(true)}
          disabled={!synced}
          leftIcon={<Flag className="w-3.5 h-3.5" />}
        >
          End Auction
        </Button>
      </div>

      {/* Confirmation Dialog for Skipping */}
      <ConfirmDialog
        isOpen={confirmSkipOpen}
        onClose={() => setConfirmSkipOpen(false)}
        onConfirm={() => {
          onSkip();
          setConfirmSkipOpen(false);
        }}
        title="Mark Player Unsold & Skip?"
        message="Are you sure you want to skip this player? They will be immediately moved to the Unsold / Recall pot."
        confirmLabel="Skip Player"
      />

      {/* Confirmation Dialog for Ending Auction */}
      <ConfirmDialog
        isOpen={confirmEndOpen}
        onClose={() => setConfirmEndOpen(false)}
        onConfirm={() => {
          onEnd();
          setConfirmEndOpen(false);
        }}
        title="End Entire Auction?"
        message="Are you sure you want to conclude this auction room? All participants will be redirected to the post-auction Results room."
        confirmLabel="End Auction Now"
        variant="danger"
      />
    </div>
  );
};

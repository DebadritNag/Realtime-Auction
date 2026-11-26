"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RecallPlayersModal } from "./RecallPlayersModal";
import { AddPlayersModal } from "./AddPlayersModal";
import { webSocketService } from "@/services/websocket.service";
import { normalizeError } from "@/services/api";
import type { PlayerDTO } from "@/types/backend";
import { Play, Pause, SkipForward, Flag, RotateCcw, History, LayoutDashboard } from "lucide-react";

export interface HostAuctionControlsProps {
  hasActivePlayer: boolean; hasBid: boolean; synced: boolean; canRecall: boolean; unsoldPlayers: PlayerDTO[]; roomCode: string;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onEnd: () => void;
  onViewHistory?: () => void;
  onReturnToDashboard?: () => void;
  /** Live pool import (RUNNING or PAUSED). Hidden when omitted. */
  canAddPlayers?: boolean;
  poolSource?: "DEFAULT" | "FC26";
  /** Imported players waiting for an explicit release because their category already finished. */
  heldAdditions?: number;
}

export const HostAuctionControls: React.FC<HostAuctionControlsProps> = ({
  hasActivePlayer, hasBid, synced, canRecall, unsoldPlayers, roomCode,
  isPaused,
  onPause,
  onResume,
  onSkip,
  onEnd,
  onViewHistory,
  onReturnToDashboard,
  canAddPlayers,
  poolSource = "DEFAULT",
  heldAdditions = 0,
}) => {
  const [recallOpen, setRecallOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmReleaseOpen, setConfirmReleaseOpen] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const release = async () => {
    setConfirmReleaseOpen(false); setReleaseError(null);
    try { await webSocketService.send({ type: "RELEASE_POOL_ADDITIONS", payload: { roomCode } }); }
    catch (cause) { setReleaseError(normalizeError(cause).message); }
  };
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

        <Button variant="secondary" size="sm" disabled={!synced || !canRecall || !unsoldPlayers.length}
          title={unsoldPlayers.length ? "Recall unsold players to the waiting pool" : "No unsold players available"}
          leftIcon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => setRecallOpen(true)}>
          Recall Player ({unsoldPlayers.length})
        </Button>
        {canAddPlayers !== undefined ? (
          <Button variant="secondary" size="sm" disabled={!synced || !canAddPlayers} onClick={() => setAddOpen(true)}
            title={canAddPlayers ? "Add players to the pool without interrupting the auction" : "Available while the auction is running or paused"}>
            + ADD PLAYERS TO AUCTION
          </Button>
        ) : null}
        {heldAdditions > 0 ? (
          <Button variant="secondary" size="sm" disabled={!synced || !canAddPlayers} onClick={() => setConfirmReleaseOpen(true)}
            title="Introduce imported players whose category has already finished">
            Release held players ({heldAdditions})
          </Button>
        ) : null}
        {onViewHistory ? (
          <Button variant="secondary" size="sm" onClick={onViewHistory} leftIcon={<History className="w-3.5 h-3.5" />}>
            View Auction History
          </Button>
        ) : null}
        {onReturnToDashboard ? (
          <Button variant="secondary" size="sm" className="host-return-btn" onClick={onReturnToDashboard} leftIcon={<LayoutDashboard className="w-3.5 h-3.5" />}>
            Return to Dashboard
          </Button>
        ) : null}
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

      {releaseError && <p role="alert" className="basis-full text-rose-300">{releaseError}</p>}
      {addOpen && <AddPlayersModal roomCode={roomCode} enabled={synced && !!canAddPlayers} poolSource={poolSource} onClose={() => setAddOpen(false)} />}
      <ConfirmDialog
        isOpen={confirmReleaseOpen}
        onClose={() => setConfirmReleaseOpen(false)}
        onConfirm={() => void release()}
        title="Release held players?"
        message="These imported players belong to categories that already finished. They will join the end of the queue. The current player and timer are not affected."
        confirmLabel="Release players"
      />
      {recallOpen && <RecallPlayersModal players={unsoldPlayers} roomCode={roomCode}
        enabled={synced && canRecall} onClose={() => setRecallOpen(false)} />}
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

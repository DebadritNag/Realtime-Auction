"use client";

import React from "react";
import { CheckCircle2, CircleSlash, Clock3, Gavel, PauseCircle } from "lucide-react";
import { PlayerAuctionCard } from "@/components/auction/PlayerAuctionCard";
import { AcquisitionBadge } from "@/components/shared/AcquisitionBadge";
import type { Player, Team } from "@/types";
import { formatCr } from "@/lib/utils";

export type StageStatus = "UPCOMING" | "ACTIVE" | "PAUSED" | "SOLD" | "UNSOLD";

const STATUS: Record<StageStatus, { label: string; Icon: typeof Gavel }> = {
  UPCOMING: { label: "Upcoming", Icon: Clock3 },
  ACTIVE: { label: "Bidding open", Icon: Gavel },
  PAUSED: { label: "Paused", Icon: PauseCircle },
  SOLD: { label: "Sold", Icon: CheckCircle2 },
  UNSOLD: { label: "Unsold", Icon: CircleSlash },
};

export interface PlayerStageProps {
  player: Player | null;
  status: StageStatus;
  currentBid: number;
  highestBidder: Team | null;
  soldPrice?: number;
  soldTo?: string;
}

/** C (left): large player panel with a status chip whose colour differs for upcoming, active, sold and unsold. */
export function PlayerStage({ player, status, currentBid, highestBidder, soldPrice, soldTo }: PlayerStageProps) {
  const { label, Icon } = STATUS[status];
  return (
    <section className="player-stage" data-status={status} data-testid="player-stage" aria-label="Player on the block">
      <div className="player-stage-bar">
        <span className="player-stage-chip" data-testid="player-stage-status"><Icon size={14} aria-hidden="true" /> {label}</span>
        {player ? (
          <span className="player-stage-summary" data-testid="player-stage-summary">
            {status === "SOLD" && soldTo ? <>Sold to <strong>{soldTo}</strong> for <strong>{formatCr(soldPrice ?? currentBid)}</strong></> :
             status === "UNSOLD" ? "No bids reached the reserve" :
             highestBidder ? <>Highest bid <strong>{formatCr(currentBid)}</strong> by <strong>{highestBidder.name}</strong></> :
             <>Base price <strong>{formatCr(player.basePrice)}</strong></>}
          </span>
        ) : null}
      </div>
      <PlayerAuctionCard player={player} variant="auction" />
      {player?.isRetained ? <AcquisitionBadge variant="detail" retained teamName={player.soldToTeamName} costCr={player.soldPrice} className="m-3" /> : null}
    </section>
  );
}

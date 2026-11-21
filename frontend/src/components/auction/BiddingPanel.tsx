"use client";

import React from "react";
import { ArrowUpRight, Gavel } from "lucide-react";
import { useAuctionStore } from "@/stores/auction.store";
import { useAuctionTimer } from "@/hooks/useAuctionTimer";
import { CurrentBid } from "@/components/auction/CurrentBid";
import { AuctionTimer } from "@/components/auction/AuctionTimer";
import { AuctionControls } from "@/components/auction/AuctionControls";
import type { ConnectionStateStatus } from "@/stores/connection.store";
import type { Team } from "@/types";
import { formatCr, formatTimeSeconds } from "@/lib/utils";

export interface BiddingPanelProps {
  connectionStatus: ConnectionStateStatus;
  userTeam?: Team;
  isUserLeading: boolean;
}

/** C (right): current bid, highest bidder, timer, quick-bid controls and server feedback. All values come from the store; bid rules are unchanged. */
export function BiddingPanel({ connectionStatus, userTeam, isUserLeading }: BiddingPanelProps) {
  const snapshot = useAuctionStore((s) => s.snapshot);
  const activePlayer = useAuctionStore((s) => s.activePlayer);
  const currentBid = useAuctionStore((s) => s.currentBid);
  const highestBidder = useAuctionStore((s) => s.highestBidder);
  const endsAt = useAuctionStore((s) => s.endsAt);
  const serverTimeOffset = useAuctionStore((s) => s.serverTimeOffset);
  const minimumNextBid = useAuctionStore((s) => s.minimumNextBid);
  const auctionStatus = useAuctionStore((s) => s.auctionStatus);
  const antiSnipingNotice = useAuctionStore((s) => s.antiSnipingNotice);
  const bidErrorNotice = useAuctionStore((s) => s.bidErrorNotice);
  const skipVoteNotice = useAuctionStore((s) => s.skipVoteNotice);
  const placeBid = useAuctionStore((s) => s.placeBid);
  const clearBidError = useAuctionStore((s) => s.clearBidError);
  const userBudget = userTeam ? userTeam.budgetRemaining : 0;

  return (
    <section className="auction-bid-console" aria-label="Live bidding" data-testid="bidding-panel">
      <div className="auction-metrics">
        <CurrentBid currentBid={currentBid} highestBidder={highestBidder} currentTeamId={userTeam?.id} />
        <AuctionTimer
          endsAt={endsAt}
          serverTimeOffset={serverTimeOffset}
          isPaused={auctionStatus === "PAUSED"}
          remainingTimeMs={snapshot?.remainingTimeMs ?? null}
          synced={connectionStatus === "SYNCED"}
        />
      </div>
      <AuctionControls
        minimumNextBid={minimumNextBid}
        currentBid={currentBid}
        userBudgetRemaining={userBudget}
        isUserLeading={isUserLeading}
        isPaused={auctionStatus === "PAUSED"}
        onPlaceBid={placeBid}
        disabled={connectionStatus !== "SYNCED" || !activePlayer || !snapshot?.biddingOpen}
        maximumPermittedBid={snapshot?.maximumPermittedBidCr ?? 0}
        allowCustomBids={snapshot?.settings.allowCustomBids ?? false}
        antiSnipingNotice={antiSnipingNotice}
        bidErrorNotice={bidErrorNotice}
        onClearError={clearBidError}
        snapshot={snapshot}
        synced={connectionStatus === "SYNCED"}
        skipVoteNotice={skipVoteNotice}
      />
    </section>
  );
}

/** Stays visible while another section is open, so the live bid and timer are never out of sight. */
export function CompactBidBar({ connectionStatus, onBack }: { connectionStatus: ConnectionStateStatus; onBack: () => void }) {
  const activePlayer = useAuctionStore((s) => s.activePlayer);
  const currentBid = useAuctionStore((s) => s.currentBid);
  const highestBidder = useAuctionStore((s) => s.highestBidder);
  const endsAt = useAuctionStore((s) => s.endsAt);
  const serverTimeOffset = useAuctionStore((s) => s.serverTimeOffset);
  const paused = useAuctionStore((s) => s.auctionStatus === "PAUSED");
  const remainingTimeMs = useAuctionStore((s) => s.snapshot?.remainingTimeMs ?? null);
  const { seconds } = useAuctionTimer(endsAt, serverTimeOffset, paused, remainingTimeMs, connectionStatus === "SYNCED");
  return (
    <div className="auction-compact-bar" role="status" aria-label="Live bidding status" data-testid="compact-bid-bar">
      <Gavel size={16} aria-hidden="true" />
      <span className="auction-compact-player" data-testid="compact-player">{activePlayer ? activePlayer.name : "Waiting for the next player"}</span>
      {activePlayer ? (
        <>
          <span className="auction-compact-bid" data-testid="compact-bid">{formatCr(currentBid)}</span>
          <span className="auction-compact-bidder">{highestBidder ? highestBidder.name : "No bids yet"}</span>
          <span className="auction-compact-timer" data-testid="compact-timer">{endsAt || paused ? formatTimeSeconds(seconds) + "s" : "--"}</span>
        </>
      ) : null}
      <button type="button" onClick={onBack} className="auction-compact-back">
        Back to live auction <ArrowUpRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

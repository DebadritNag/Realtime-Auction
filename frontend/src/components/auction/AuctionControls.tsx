"use client";
import React, { useState } from "react";
import { formatCr } from "@/lib/utils";
import { croreToUnits, unitsToCrore } from "@/lib/money";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { webSocketService } from "@/services/websocket.service";
import { normalizeError } from "@/services/api";
import type { AntiSnipingNotice } from "@/stores/auction.store";
import type { RoomStateDTO } from "@/types/backend";
import { Zap, Clock, AlertCircle, Edit3, ArrowUpCircle, X, SkipForward, Check } from "lucide-react";

export interface AuctionControlsProps {
  disabled?: boolean;
  maximumPermittedBid: number;
  allowCustomBids: boolean;
  minimumNextBid: number;
  currentBid: number;
  userBudgetRemaining: number;
  isUserLeading: boolean;
  isPaused: boolean;
  onPlaceBid: (amount: number) => void;
  antiSnipingNotice: AntiSnipingNotice | null;
  bidErrorNotice: string | null;
  onClearError: () => void;
  // Skip vote — all participating managers (including host) can vote
  snapshot: RoomStateDTO | null;
  synced: boolean;
  skipVoteNotice: string | null;
}

export const AuctionControls: React.FC<AuctionControlsProps> = ({
  disabled = false, maximumPermittedBid, allowCustomBids, minimumNextBid, currentBid,
  userBudgetRemaining, isUserLeading, isPaused, onPlaceBid, antiSnipingNotice,
  bidErrorNotice, onClearError, snapshot, synced, skipVoteNotice,
}) => {
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [customBidValue, setCustomBidValue] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [skipPending, setSkipPending] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);

  const canAffordMinimum = minimumNextBid > 0 && maximumPermittedBid >= minimumNextBid;
  const inactive = disabled || isPaused || isUserLeading;

  const submit = (amount: number) => { onClearError(); onPlaceBid(amount); };

  const quickBids = [1, 3, 5].map(delta => ({
    delta, amount: unitsToCrore(croreToUnits(currentBid) + croreToUnits(delta)),
  }));

  const handleCustomBidSubmit = (event: React.FormEvent) => {
    event.preventDefault(); setCustomError(null);
    if (inactive || !allowCustomBids) { setCustomError('Bidding is currently unavailable.'); return; }
    const amount = Number(customBidValue);
    if (!customBidValue.trim() || !Number.isFinite(amount) || !Number.isSafeInteger(amount * 2) || amount < minimumNextBid) {
      setCustomError(`Use ₹0.5 Cr steps; bid at least ${formatCr(minimumNextBid)}.`); return;
    }
    if (amount > maximumPermittedBid) {
      setCustomError(`Your permitted maximum is ${formatCr(maximumPermittedBid)}, including squad reserves.`); return;
    }
    submit(amount); setIsCustomModalOpen(false); setCustomBidValue('');
  };

  // ── Skip vote ────────────────────────────────────────────────────────────
  const skipVote = snapshot?.skipVote;
  const activationId = snapshot?.activationId;
  const activePlayerId = snapshot?.activePlayerId;

  // Skip is available when: synced, running, bidding open, no accepted bid yet
  const skipAvailable =
    synced &&
    snapshot?.status === 'RUNNING' &&
    snapshot?.biddingOpen &&
    !snapshot?.highestBidderTeamId &&
    !!activationId &&
    !!activePlayerId &&
    !!skipVote &&
    skipVote.required > 0;

  const hasVoted = skipVote?.hasCurrentUserVoted ?? false;

  const handleSkipVote = async () => {
    if (!skipAvailable || skipPending || !activePlayerId || !activationId || !snapshot) return;
    setSkipPending(true);
    setSkipError(null);
    try {
      await webSocketService.send({
        type: hasVoted ? 'REMOVE_SKIP_VOTE' : 'VOTE_SKIP_PLAYER',
        payload: {
          roomCode: snapshot.roomCode,
          playerId: activePlayerId,
          activationId,
        },
      });
    } catch (cause) {
      setSkipError(normalizeError(cause).message);
    } finally {
      setSkipPending(false);
    }
  };

  const mainLabel = isPaused
    ? 'Auction paused'
    : disabled
    ? 'Waiting for live state'
    : isUserLeading
    ? 'You are highest bidder'
    : !canAffordMinimum
    ? 'Insufficient budget'
    : `Bid ${formatCr(minimumNextBid)}`;

  const skipLabel = skipVote
    ? hasVoted
      ? `✓ ${skipVote.votes}/${skipVote.required}`
      : `Skip ${skipVote.votes}/${skipVote.required}`
    : 'Skip';

  return (
    <div className="auction-bid-actions">
      {antiSnipingNotice?.active && (
        <div role="status" className="auction-extension">
          <Clock size={15} /><span>{antiSnipingNotice.message}</span>
        </div>
      )}
      {bidErrorNotice && (
        <div role="alert" className="auction-bid-error">
          <AlertCircle size={16} />
          <span>{bidErrorNotice}</span>
          <button type="button" aria-label="Dismiss bid error" onClick={onClearError}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Primary action row: Bid | Custom Bid | Skip ─────────────────── */}
      <div className="auction-primary-actions">
        <Button
          variant="primary"
          className="auction-main-bid"
          onClick={() => submit(minimumNextBid)}
          disabled={inactive || !canAffordMinimum}
          leftIcon={<Zap size={19} />}
        >
          {mainLabel}
        </Button>

        <Button
          variant="secondary"
          className="auction-custom-bid"
          disabled={inactive || !allowCustomBids || !canAffordMinimum}
          leftIcon={<Edit3 size={16} />}
          onClick={() => {
            setCustomBidValue(String(minimumNextBid));
            setCustomError(null);
            setIsCustomModalOpen(true);
          }}
        >
          Custom
        </Button>

        {/* Skip vote button — all managers including host */}
        {skipVote && skipVote.required > 0 && (
          <button
            type="button"
            className={`auction-skip-btn${hasVoted ? ' auction-skip-voted' : ''}`}
            disabled={!skipAvailable || skipPending}
            aria-label={hasVoted ? `Remove skip vote (${skipVote.votes}/${skipVote.required})` : `Vote to skip player (${skipVote.votes}/${skipVote.required})`}
            title={
              snapshot?.highestBidderTeamId
                ? 'Skip voting unavailable after an accepted bid'
                : `All participating managers must agree. ${skipVote.votes}/${skipVote.required} votes cast.`
            }
            onClick={() => void handleSkipVote()}
          >
            {hasVoted
              ? <><Check size={14} /><span>{skipLabel}</span></>
              : <><SkipForward size={14} /><span>{skipLabel}</span></>
            }
          </button>
        )}
      </div>

      {/* Skip vote notice (e.g. "Skip votes reset after a valid bid.") */}
      {(skipVoteNotice || skipError) && (
        <p role="status" className="auction-bid-rules" style={{ color: skipError ? '#ffc2ca' : undefined }}>
          {skipError ?? skipVoteNotice}
        </p>
      )}

      {/* ── Quick raise ─────────────────────────────────────────────────── */}
      <div className="auction-quick-heading">
        <span>Quick raise</span>
        <span>{allowCustomBids ? 'Above the current price' : 'Custom bids disabled in this room'}</span>
      </div>
      <div className="auction-quick-bids" role="group" aria-label="Quick bid increments">
        {quickBids.map(({ delta, amount }) => (
          <button
            type="button"
            key={delta}
            disabled={inactive || !allowCustomBids || minimumNextBid <= 0}
            aria-label={`Bid ${formatCr(amount)} (+${delta} Cr)`}
            title={`Propose ${formatCr(amount)}. Server bid and budget rules apply.`}
            onClick={() => submit(amount)}
          >
            <strong>+{delta}<small> Cr</small></strong>
            <span>{formatCr(amount)}</span>
          </button>
        ))}
      </div>

      <dl className="auction-bid-limits">
        <div><dt>Next minimum</dt><dd>{formatCr(minimumNextBid)}</dd></div>
        <div><dt>Your purse</dt><dd>{formatCr(userBudgetRemaining)}</dd></div>
        <div><dt>Permitted maximum</dt><dd>{formatCr(maximumPermittedBid)}</dd></div>
      </dl>
      <p className="auction-bid-rules">Bid steps: below ₹10 Cr +₹0.5 · ₹10–20 Cr +₹1 · ₹20 Cr+ +₹2</p>

      <Modal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        title="Place Custom Bid"
        description={`Minimum ${formatCr(minimumNextBid)} · Maximum ${formatCr(maximumPermittedBid)}`}
        maxWidth="sm"
      >
        <form onSubmit={handleCustomBidSubmit} className="space-y-4">
          <Input
            label="Bid Amount (in ₹ Cr)"
            type="number"
            step="0.5"
            min={minimumNextBid}
            max={maximumPermittedBid}
            value={customBidValue}
            onChange={e => setCustomBidValue(e.target.value)}
            error={customError || undefined}
            autoFocus
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsCustomModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={inactive || !allowCustomBids} rightIcon={<ArrowUpCircle size={16} />}>
              Confirm bid
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

"use client";

import React, { useState } from "react";
import { formatCr } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { AntiSnipingNotice } from "@/stores/auction.store";
import { Zap, Clock, AlertCircle, Edit3, ArrowUpCircle } from "lucide-react";

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
}

export const AuctionControls: React.FC<AuctionControlsProps> = ({
  disabled = false, maximumPermittedBid, allowCustomBids,
  minimumNextBid,
  currentBid,
  userBudgetRemaining,
  isUserLeading,
  isPaused,
  onPlaceBid,
  antiSnipingNotice,
  bidErrorNotice,
  onClearError,
}) => {
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [customBidValue, setCustomBidValue] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  // Use backend provided minimumNextBid as source of truth
  const nextBidAmount = minimumNextBid;
  const canAfford = maximumPermittedBid >= nextBidAmount && nextBidAmount > 0;

  const handleInstantBid = () => {
    onClearError();
    onPlaceBid(nextBidAmount);
  };

  const handleCustomBidSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);
    const parsed = parseFloat(customBidValue);

    if (!Number.isFinite(parsed) || !Number.isSafeInteger(parsed * 2) || parsed < nextBidAmount) {
      setCustomError(`Use ₹0.5 Cr steps; bid must be at least ${formatCr(nextBidAmount)}`);
      return;
    }
    if (parsed > maximumPermittedBid) {
      setCustomError(
        `Insufficient purse! You have only ${formatCr(userBudgetRemaining)} remaining.`
      );
      return;
    }

    onPlaceBid(parsed);
    setIsCustomModalOpen(false);
    setCustomBidValue("");
  };

  return (
    <div className="w-full space-y-3">
      {/* Anti-Sniping Notification Banner */}
      {antiSnipingNotice?.active && (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-amber-500/15 border border-amber-500/40 p-2 text-xs font-bold text-amber-300 animate-notice shadow-[0_0_15px_rgba(245,158,11,0.2)]">
          <Clock className="w-4 h-4 animate-spin shrink-0 text-amber-400" />
          <span>TIME EXTENDED: {antiSnipingNotice.message}</span>
        </div>
      )}

      {/* Bid Error Banner */}
      {bidErrorNotice && (
        <div className="flex items-center justify-between rounded-xl bg-red-950/50 border border-red-500/50 p-3 text-xs text-red-300 animate-notice">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#ef4444]" />
            <span>{bidErrorNotice}</span>
          </div>
          <button
            onClick={onClearError}
            className="text-red-400 hover:text-white font-mono text-xs ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Action Buttons Row */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        {/* Primary Instant Bid Button */}
        <Button
          variant="stadium"
          size="xl"
          onClick={handleInstantBid}
          disabled={disabled || isPaused || !canAfford || isUserLeading}
          className="w-full flex-1 py-4 text-lg font-black tracking-wider group"
          leftIcon={<Zap className="w-5 h-5 fill-current text-[#08090d] group-hover:scale-110 transition-transform" />}
        >
          {disabled ? ("WAITING FOR LIVE STATE") : isUserLeading ? (
            "YOU ARE HIGHEST BIDDER"
          ) : !canAfford ? (
            "INSUFFICIENT BUDGET"
          ) : isPaused ? (
            "AUCTION PAUSED"
          ) : (
            `BID ${formatCr(nextBidAmount).toUpperCase()}`
          )}
        </Button>

        {/* Custom Bid Trigger */}
        <Button
          variant="secondary"
          size="lg"
          onClick={() => {
            setCustomBidValue(nextBidAmount.toString());
            setIsCustomModalOpen(true);
          }}
          disabled={disabled || !allowCustomBids || isPaused || !canAfford || isUserLeading}
          className="w-full sm:w-auto px-5 py-4 text-xs font-bold uppercase tracking-wider"
          leftIcon={<Edit3 className="w-4 h-4" />}
        >
          Custom Bid
        </Button>
      </div>

      {/* Helper text showing remaining budget and user state */}
      <div className="flex items-center justify-between px-1 text-[11px] text-[#64748b]">
        <span>
          Next minimum valid increment:{" "}
          <strong className="text-[#cbd5e1] font-mono">
            {formatCr(nextBidAmount)}
          </strong>
        </span>
        <span>
          Your Remaining Purse:{" "}
          <strong className="text-[#00ff87] font-mono font-bold">
            {formatCr(userBudgetRemaining)}
          </strong>
        </span>
      </div>

      <p className="text-[10px] text-[#64748b]">Bid steps: below ₹10 Cr +₹0.5; ₹10–20 Cr +₹1; ₹20 Cr+ +₹2. Maximum permitted: {formatCr(maximumPermittedBid)}</p>
      {/* Custom Bid Modal */}
      <Modal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        title="Place Custom Bid"
        description={`Must be greater than or equal to ${formatCr(nextBidAmount)}`}
        maxWidth="sm"
      >
        <form onSubmit={handleCustomBidSubmit} className="space-y-4">
          <Input
            label="Bid Amount (in ₹ Cr)"
            type="number"
            step="0.5"
            min={nextBidAmount}
            max={maximumPermittedBid}
            value={customBidValue}
            onChange={(e) => setCustomBidValue(e.target.value)}
            error={customError || undefined}
            leftIcon={<span className="text-sm font-bold font-mono">₹</span>}
            rightElement={<span className="text-xs font-bold text-[#64748b]">CR</span>}
            autoFocus
            required
          />

          <div className="flex items-center justify-between text-xs text-[#94a3b8]">
            <span>Your purse limit:</span>
            <span className="font-mono font-bold text-[#00ff87]">
              {formatCr(userBudgetRemaining)}
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#242c3d]">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsCustomModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              rightIcon={<ArrowUpCircle className="w-4 h-4" />}
            >
              Confirm Bid
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

"use client";
import React, { useState } from "react";
import { formatCr } from "@/lib/utils";
import { croreToUnits, unitsToCrore } from "@/lib/money";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import type { AntiSnipingNotice } from "@/stores/auction.store";
import { Zap, Clock, AlertCircle, Edit3, ArrowUpCircle, X } from "lucide-react";

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
  disabled = false, maximumPermittedBid, allowCustomBids, minimumNextBid, currentBid,
  userBudgetRemaining, isUserLeading, isPaused, onPlaceBid, antiSnipingNotice,
  bidErrorNotice, onClearError,
}) => {
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [customBidValue, setCustomBidValue] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const canAffordMinimum = minimumNextBid > 0 && maximumPermittedBid >= minimumNextBid;
  const inactive = disabled || isPaused || isUserLeading;
  const submit = (amount: number) => { onClearError(); onPlaceBid(amount); };
  // Convenience proposals only: do not clamp to the minimum or mutate live state.
  const quickBids = [1, 3, 5].map(delta => ({delta, amount: unitsToCrore(croreToUnits(currentBid) + croreToUnits(delta))}));
  const handleCustomBidSubmit = (event: React.FormEvent) => {
    event.preventDefault(); setCustomError(null);
    if (inactive || !allowCustomBids) { setCustomError('Bidding is currently unavailable.'); return; }
    const amount = Number(customBidValue);
    if (!customBidValue.trim() || !Number.isFinite(amount) || !Number.isSafeInteger(amount * 2) || amount < minimumNextBid) {
      setCustomError(`Use ₹0.5 Cr steps; bid at least ${formatCr(minimumNextBid)}.`); return;
    }
    if (amount > maximumPermittedBid) { setCustomError(`Your permitted maximum is ${formatCr(maximumPermittedBid)}, including squad reserves.`); return; }
    submit(amount); setIsCustomModalOpen(false); setCustomBidValue('');
  };
  const mainLabel = isPaused ? 'Auction paused' : disabled ? 'Waiting for live state' : isUserLeading ? 'You are highest bidder' : !canAffordMinimum ? 'Insufficient budget' : `Bid ${formatCr(minimumNextBid)}`;

  return <div className="auction-bid-actions">
    {antiSnipingNotice?.active && <div role="status" className="auction-extension"><Clock size={15}/><span>{antiSnipingNotice.message}</span></div>}
    {bidErrorNotice && <div role="alert" className="auction-bid-error"><AlertCircle size={16}/><span>{bidErrorNotice}</span><button type="button" aria-label="Dismiss bid error" onClick={onClearError}><X size={16}/></button></div>}
    <div className="auction-primary-actions">
      <Button variant="primary" className="auction-main-bid" onClick={()=>submit(minimumNextBid)} disabled={inactive || !canAffordMinimum} leftIcon={<Zap size={19}/>}>{mainLabel}</Button>
      <Button variant="secondary" className="auction-custom-bid" disabled={inactive || !allowCustomBids || !canAffordMinimum} leftIcon={<Edit3 size={16}/>} onClick={()=>{setCustomBidValue(String(minimumNextBid));setCustomError(null);setIsCustomModalOpen(true);}}>Custom bid</Button>
    </div>
    <div className="auction-quick-heading"><span>Quick raise</span><span>{allowCustomBids ? 'Above the current price' : 'Custom bids disabled in this room'}</span></div>
    <div className="auction-quick-bids" role="group" aria-label="Quick bid increments">
      {quickBids.map(({delta,amount})=><button type="button" key={delta} disabled={inactive || !allowCustomBids || minimumNextBid <= 0}
        aria-label={`Bid ${formatCr(amount)} (+${delta} Cr)`} title={`Propose ${formatCr(amount)}. Server bid and budget rules apply.`}
        onClick={()=>submit(amount)}><strong>+{delta}<small> Cr</small></strong><span>{formatCr(amount)}</span></button>)}
    </div>
    <dl className="auction-bid-limits"><div><dt>Next minimum</dt><dd>{formatCr(minimumNextBid)}</dd></div><div><dt>Your purse</dt><dd>{formatCr(userBudgetRemaining)}</dd></div><div><dt>Permitted maximum</dt><dd>{formatCr(maximumPermittedBid)}</dd></div></dl>
    <p className="auction-bid-rules">Bid steps: below ₹10 Cr +₹0.5 · ₹10–20 Cr +₹1 · ₹20 Cr+ +₹2</p>
    <Modal isOpen={isCustomModalOpen} onClose={()=>setIsCustomModalOpen(false)} title="Place Custom Bid" description={`Minimum ${formatCr(minimumNextBid)} · Maximum ${formatCr(maximumPermittedBid)}`} maxWidth="sm">
      <form onSubmit={handleCustomBidSubmit} className="space-y-4">
        <Input label="Bid Amount (in ₹ Cr)" type="number" step="0.5" min={minimumNextBid} max={maximumPermittedBid} value={customBidValue} onChange={e=>setCustomBidValue(e.target.value)} error={customError || undefined} autoFocus required/>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={()=>setIsCustomModalOpen(false)}>Cancel</Button><Button type="submit" disabled={inactive || !allowCustomBids} rightIcon={<ArrowUpCircle size={16}/>}>Confirm bid</Button></div>
      </form>
    </Modal>
  </div>;
};

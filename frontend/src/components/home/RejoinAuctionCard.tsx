"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { roomService } from "@/services/room.service";

/** Reconnects an existing member by room code only; never sends a team name or id. */
export const RejoinAuctionCard: React.FC = () => {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const summary = await roomService.rejoin(code);
      router.push(summary.resumePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rejoin this auction.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[#15384e] bg-[#051521] p-4 sm:p-5 flex flex-col gap-3" data-testid="rejoin-card">
      <h3 className="text-base font-extrabold text-white">Rejoin Existing Auction</h3>
      <p className="text-xs text-[#a6bacd]">Already part of an auction? Enter its room code to reconnect to your team.</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <label className="sr-only" htmlFor="rejoin-code">Room code</label>
        <input id="rejoin-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} autoComplete="off"
          placeholder="ROOM CODE" className="flex-1 min-w-0 rounded-lg bg-[#030d14] border border-[#15384e] px-3 py-2 text-sm text-white font-mono uppercase tracking-wider focus:outline-none focus:border-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400" />
        <Button type="submit" variant="secondary" size="md" isLoading={busy} disabled={busy || !code.trim()} leftIcon={<LogIn className="w-4 h-4" aria-hidden="true" />}>Rejoin Auction</Button>
      </div>
      {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
    </form>
  );
};

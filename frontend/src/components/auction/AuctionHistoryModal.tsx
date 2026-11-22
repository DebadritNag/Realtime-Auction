"use client";
import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { api } from "@/services/api";
import { useAuctionStore } from "@/stores/auction.store";

interface HistoryBid { id: string; playerId: string; teamId: string; amountCr: number; at: number }
interface HistoryPage { total: number; bids: HistoryBid[] }

/** Read-only auction history from the persisted snapshot; earlier bids come from GET /rooms/:code/history. */
export function AuctionHistoryModal({ isOpen, onClose, roomCode }: { isOpen: boolean; onClose: () => void; roomCode: string }) {
  const snapshot = useAuctionStore((s) => s.snapshot);
  const players = useAuctionStore((s) => s.players);
  const [bids, setBids] = useState<HistoryBid[] | null>(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = async () => {
    setBusy(true); setError(null);
    try {
      const offset = bids?.length ?? 0;
      const page = await api.get<HistoryPage>("/rooms/" + roomCode + "/history?offset=" + offset + "&limit=50");
      setBids([...(bids ?? []), ...page.bids]); setTotal(page.total);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load bids."); }
    finally { setBusy(false); }
  };

  const activity = snapshot?.activity ?? [];
  const sold = activity.filter((a) => a.kind === "SOLD");
  const unsold = snapshot?.unsoldPlayers ?? [];
  const teamName = (id: string) => snapshot?.teams.find((t) => t.id === id)?.name ?? id;
  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? id;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Auction History" description={"Room " + roomCode} maxWidth="xl">
      <div className="space-y-4 max-h-[65vh] overflow-y-auto text-sm text-[#cbd5e1]" data-testid="history-modal">
        <section><h4 className="font-bold text-white mb-1">Sold ({sold.length})</h4>
          {sold.length ? <ul className="space-y-1">{sold.map((a) => <li key={a.id}>{a.playerName} to {a.teamName} for {a.amountCr} Cr</li>)}</ul> : <p className="text-[#94a3b8]">No sales yet.</p>}
        </section>
        <section><h4 className="font-bold text-white mb-1">Unsold ({unsold.length})</h4>
          {unsold.length ? <ul className="space-y-1">{unsold.map((p) => <li key={p.id}>{p.name}</li>)}</ul> : <p className="text-[#94a3b8]">No unsold players.</p>}
        </section>
        <section><h4 className="font-bold text-white mb-1">Recent activity</h4>
          {activity.length ? <ul className="space-y-1">{activity.map((a) => <li key={a.id}>{a.kind}: {a.playerName ?? ""} {a.teamName ? "- " + a.teamName : ""} {a.amountCr !== undefined ? "(" + a.amountCr + " Cr)" : ""}</li>)}</ul> : <p className="text-[#94a3b8]">Nothing yet.</p>}
        </section>
        <section><h4 className="font-bold text-white mb-1">All bids</h4>
          {bids?.length ? <ul className="space-y-1">{bids.map((b) => <li key={b.id}>{playerName(b.playerId)}: {teamName(b.teamId)} {b.amountCr} Cr</li>)}</ul> : null}
          {error ? <p role="alert" className="text-rose-300">{error}</p> : null}
          {bids === null || bids.length < total ? <Button variant="secondary" size="sm" onClick={loadMore} isLoading={busy}>Show earlier bids</Button> : null}
        </section>
      </div>
    </Modal>
  );
}

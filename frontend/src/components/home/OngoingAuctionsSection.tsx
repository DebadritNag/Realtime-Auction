"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { roomService } from "@/services/room.service";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { relativeTime } from "@/lib/relativeTime";
import type { RoomDetailsDTO, RoomSummaryDTO } from "@/types/backend";
import { OngoingAuctionCard, STATUS_LABELS } from "./OngoingAuctionCard";

export const OngoingAuctionsSection: React.FC = () => {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<{ code: string; data?: RoomDetailsDTO; error?: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await roomService.myRooms();
      setRooms(res.rooms.filter((r) => r.ongoingStatus !== "COMPLETED" && r.ongoingStatus !== "CANCELLED"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load your ongoing auctions.");
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); };
  }, [load]);

  const showDetails = (s: RoomSummaryDTO) => {
    setDetails({ code: s.roomCode });
    roomService.summary(s.roomCode)
      .then((data) => setDetails((d) => (d?.code === s.roomCode ? { code: s.roomCode, data } : d)))
      .catch((e: unknown) => setDetails((d) => (d?.code === s.roomCode ? { code: s.roomCode, error: e instanceof Error ? e.message : "Unable to load details." } : d)));
  };

  return (
    <section aria-labelledby="ongoing-heading" data-testid="ongoing-section">
      <h2 id="ongoing-heading" className="text-sm font-black tracking-widest text-white mb-3">YOUR ONGOING AUCTIONS</h2>
      {error ? (
        <div role="alert" className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-200 flex items-center justify-between gap-3 flex-wrap">
          <span>{error}</span>
          <Button variant="secondary" size="sm" onClick={() => void load()}>Retry</Button>
        </div>
      ) : rooms === null ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true" data-testid="ongoing-skeleton">
          {[0, 1, 2].map((i) => <div key={i} className="h-44 rounded-2xl bg-[#051521] border border-[#122e42] animate-pulse" />)}
        </div>
      ) : rooms.length === 0 ? (
        <p className="rounded-xl border border-[#15384e] bg-[#051521] p-4 text-sm text-[#a6bacd]" data-testid="ongoing-empty">
          You have no unfinished auctions. Create or join a room to get started.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((r) => (
            <OngoingAuctionCard key={r.roomId} summary={r} onContinue={(s) => router.push(s.resumePath)} onDetails={showDetails} />
          ))}
        </div>
      )}
      <Modal isOpen={!!details} onClose={() => setDetails(null)} title={details?.data?.auctionName ?? "Auction details"} description={details ? "Room " + details.code : undefined} maxWidth="lg">
        {details?.error ? <p role="alert" className="text-sm text-rose-300">{details.error}</p>
          : !details?.data ? <p className="text-sm text-[#a6bacd]">Loading...</p>
          : (
            <div className="space-y-3 text-sm text-[#cbd5e1]" data-testid="ongoing-details">
              <p>Status: <strong className="text-white">{STATUS_LABELS[details.data.ongoingStatus]}</strong> &middot; Last activity {relativeTime(details.data.lastActivityAt, details.data.serverTime)}</p>
              <ul className="divide-y divide-[#242c3d]">
                {details.data.teams.map((t) => (
                  <li key={t.id} className="py-2 flex flex-wrap justify-between gap-2">
                    <span className="min-w-0 truncate">{t.name}{t.isHost ? " (Host)" : ""} <span className="text-[#94a3b8]">{t.managerUsername}</span></span>
                    <span className="text-[#94a3b8]">{t.remainingBudgetCr} Cr left &middot; {t.playersOwned} players</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
      </Modal>
    </section>
  );
};

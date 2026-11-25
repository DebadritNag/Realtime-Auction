"use client";

import React, { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAuctionStore } from "@/stores/auction.store";
import { useAuthStore } from "@/stores/auth.store";
import { useConnectionStore } from "@/stores/connection.store";
import { RetentionScreen } from "@/components/retention/RetentionScreen";
import { ConnectionStatus } from "@/components/auction/ConnectionStatus";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

/** Dedicated sequential retention page: /room/[roomCode]/retention. */
export default function RetentionPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const roomCode = use(params).roomCode.toUpperCase();
  const router = useRouter();
  const { user } = useAuthStore();
  const snapshot = useAuctionStore((s) => s.snapshot);
  const liveError = useAuctionStore((s) => s.bidErrorNotice);
  const { status: connectionStatus, latencyMs } = useConnectionStore();

  useEffect(() => {
    useAuctionStore.getState().initAuction(roomCode);
  }, [roomCode]);

  const phase = snapshot?.retention?.phase;
  const enabled = snapshot?.settings.retention?.enabled === true && !snapshot.restore;
  useEffect(() => {
    if (!snapshot) return;
    if (snapshot.status === "RUNNING" || snapshot.status === "PAUSED") router.replace("/auction/" + roomCode);
    else if (snapshot.status === "COMPLETED") router.replace("/results/" + roomCode);
    else if (!enabled || phase === "NOT_STARTED" || phase === "FINALIZED" || phase === "OFF") router.replace("/room/" + roomCode);
  }, [snapshot, enabled, phase, roomCode, router]);

  if (!snapshot) {
    return liveError ? (
      <div className="mx-auto max-w-xl px-4 py-20">
        <ErrorState title="Retention unavailable" message={liveError} onRetry={() => { useAuctionStore.getState().leaveAuction(); useAuctionStore.getState().initAuction(roomCode); }} />
      </div>
    ) : (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-10 sm:px-6 lg:px-8" role="status" aria-label="Loading retention">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const isHost = !!user && user.id === snapshot.host.userId;
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={"/room/" + roomCode} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-xs font-bold text-[#94a3b8] transition-colors duration-200 hover:text-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to lobby
        </Link>
        <ConnectionStatus status={connectionStatus} latencyMs={latencyMs} />
      </div>
      {snapshot.retention ? (
        <RetentionScreen roomCode={roomCode} snapshot={snapshot} isHost={isHost} />
      ) : (
        <ErrorState title="Retention unavailable" message="The server did not send retention data for this room." />
      )}
    </div>
  );
}

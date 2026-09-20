"use client";

import React, { useEffect, use, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoomStore } from "@/stores/room.store";
import { useAuctionStore } from "@/stores/auction.store";
import { useConnectionStore } from "@/stores/connection.store";
import { webSocketService } from "@/services/websocket.service";
import { roomService } from "@/services/room.service";

import { RoomHeader } from "@/components/room/RoomHeader";
import { TeamLobbyCard } from "@/components/room/TeamLobbyCard";
import { AuctionSettingsSummary } from "@/components/room/AuctionSettingsSummary";
import { HostControls } from "@/components/room/HostControls";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Users } from "lucide-react";

export default function RoomLobbyPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const resolvedParams = use(params);
  const roomCode = resolvedParams.roomCode.toUpperCase();
  const router = useRouter();

  const { room, isHost, isLoading, error } = useRoomStore();

  // Live state from the shared auction socket
  const snapshot     = useAuctionStore(s => s.snapshot);
  const liveTeams    = useAuctionStore(s => s.teams);       // has correct .connected from connectedUsers
  const liveError    = useAuctionStore(s => s.bidErrorNotice);
  const connectionStatus = useConnectionStore(s => s.status);

  // Leave-room confirmation modal
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [isLeaving,      setIsLeaving]      = useState(false);
  const [leaveError,     setLeaveError]     = useState<string | null>(null);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  // Open the shared WebSocket here so PRESENCE_UPDATED / ROOM_STATE start
  // flowing immediately.  The same socket is reused if the user enters the
  // auction view.  initAuction is idempotent for the same roomCode.
  useEffect(() => {
    useAuctionStore.getState().initAuction(roomCode);
  }, [roomCode]);

  // ── Auto-redirect when auction goes live ──────────────────────────────────
  useEffect(() => {
    if (snapshot?.status === "RUNNING" || snapshot?.status === "PAUSED")
      router.replace(`/auction/${roomCode}`);
    if (snapshot?.status === "COMPLETED")
      router.replace(`/results/${roomCode}`);
  }, [snapshot?.status, roomCode, router]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleStartAuction = () => {
    void useAuctionStore.getState().hostCommand("START_AUCTION").catch(() => {});
  };

  const handleLeaveConfirm = async () => {
    setIsLeaving(true);
    setLeaveError(null);
    try {
      await roomService.leave(roomCode);
    } catch {
      // 204 is success; any error means we weren't a member — proceed anyway
    }
    useAuctionStore.getState().leaveAuction();
    router.replace("/home");
  };

  // ── Loading / error guards ─────────────────────────────────────────────────
  if (isLoading || (!room && !liveError)) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || liveError || !room) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <ErrorState
          title="Room Not Found"
          message={error || liveError || `Unable to connect to room "${roomCode}".`}
          onRetry={() => {
            useAuctionStore.getState().leaveAuction();
            useAuctionStore.getState().initAuction(roomCode);
          }}
        />
      </div>
    );
  }

  // Prefer live teams (from WebSocket ROOM_STATE / PRESENCE_UPDATED) because
  // they have team.connected correctly populated.  Fall back to the REST snapshot
  // from room.store until the socket delivers the first ROOM_STATE.
  const displayTeams = liveTeams.length > 0 ? liveTeams : room.teams;

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
        <RoomHeader
          name={room.name}
          roomCode={room.roomCode}
          isHost={isHost}
          connectionStatus={connectionStatus}
          onLeave={() => setShowLeaveModal(true)}
        />

        <HostControls
          isHost={isHost}
          totalTeams={displayTeams.length}
          expectedTeams={room.settings.numberOfTeams}
          onStartAuction={handleStartAuction}
          disabled={
            connectionStatus !== "SYNCED" ||
            displayTeams.length < (snapshot?.settings.minimumParticipants ?? 2)
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Team cards */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-[#242c3d]">
              <Users className="w-4 h-4 text-[#00ff87]" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">
                REGISTERED FRANCHISES ({displayTeams.length} / {room.settings.numberOfTeams})
              </h2>
            </div>

            <div className="space-y-3">
              {displayTeams.map((team) => (
                <TeamLobbyCard
                  key={team.id}
                  team={team}
                  isHost={isHost}
                  onRemove={() => {
                    void webSocketService
                      .send({ type: "KICK_MEMBER", payload: { roomCode, targetTeamId: team.id } })
                      .catch((e: Error) =>
                        useAuctionStore.setState({ bidErrorNotice: e.message })
                      );
                  }}
                />
              ))}
            </div>
          </div>

          {/* Settings */}
          <div className="lg:col-span-5 space-y-6">
            <AuctionSettingsSummary settings={room.settings} />
          </div>
        </div>
      </div>

      {/* ── Leave confirmation modal ─────────────────────────────────────── */}
      {showLeaveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-modal-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-[#0e121a] border border-[#242c3d] p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-full bg-red-500/10 border border-red-500/30">
              <Users className="w-5 h-5 text-red-400" />
            </div>

            <div className="text-center space-y-1.5">
              <h2 id="leave-modal-title" className="text-base font-black text-[#f8fafc]">
                {isHost ? "Close This Room?" : "Leave This Room?"}
              </h2>
              <p className="text-sm text-[#94a3b8]">
                {isHost
                  ? "You are the host. Leaving will close the lobby for all participants."
                  : "You will exit the lobby and your team slot may become available."}
              </p>
            </div>

            {leaveError && (
              <p className="text-xs text-red-400 text-center">{leaveError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setShowLeaveModal(false); setLeaveError(null); }}
                disabled={isLeaving}
                className="flex-1 py-2.5 px-4 rounded-xl text-sm font-bold border border-[#242c3d] bg-[#151a24] text-[#94a3b8] hover:text-[#f8fafc] hover:border-[#37435e] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleLeaveConfirm}
                disabled={isLeaving}
                className="flex-1 py-2.5 px-4 rounded-xl text-sm font-bold border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/70 transition-colors disabled:opacity-50"
              >
                {isLeaving ? "Leaving…" : isHost ? "Leave & Close Room" : "Leave Room"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import React, { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useRoomStore } from "@/stores/room.store";
import { useAuthStore } from "@/stores/auth.store";

import { RoomHeader } from "@/components/room/RoomHeader";
import { TeamLobbyCard } from "@/components/room/TeamLobbyCard";
import { AuctionSettingsSummary } from "@/components/room/AuctionSettingsSummary";
import { HostControls } from "@/components/room/HostControls";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { useAuctionStore } from "@/stores/auction.store";
import { useConnectionStore } from "@/stores/connection.store";
import { webSocketService } from "@/services/websocket.service";
import { ConnectionStatus } from "@/components/auction/ConnectionStatus";
import { Users } from "lucide-react";

export default function RoomLobbyPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const resolvedParams = use(params);
  const roomCode = resolvedParams.roomCode.toUpperCase();
  const router = useRouter();

  const { room, isHost, isLoading, error, fetchRoom } = useRoomStore();
  const { user } = useAuthStore();

  const snapshot = useAuctionStore(s => s.snapshot);
  const liveError = useAuctionStore(s => s.bidErrorNotice);
  const status = useConnectionStore(s => s.status);
  useEffect(() => {
    if (snapshot?.status === 'RUNNING' || snapshot?.status === 'PAUSED') router.replace(`/auction/${roomCode}`);
    if (snapshot?.status === 'COMPLETED') router.replace(`/results/${roomCode}`);
  }, [snapshot?.status, roomCode, router]);
  const handleStartAuction = () => { void useAuctionStore.getState().hostCommand('START_AUCTION').catch(() => {}); };

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
          onRetry={() => { useAuctionStore.getState().leaveAuction(); useAuctionStore.getState().initAuction(roomCode); }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      <RoomHeader
        name={room.name}
        roomCode={room.roomCode}
        isHost={isHost}
        connected={status === "SYNCED"}
      />

      <HostControls
        isHost={isHost}
        totalTeams={room.teams.length}
        expectedTeams={room.settings.numberOfTeams}
        onStartAuction={handleStartAuction}
        disabled={status !== "SYNCED" || room.teams.length < (snapshot?.settings.minimumParticipants ?? 2)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#242c3d]">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#00ff87]" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">
                REGISTERED FRANCHISES ({room.teams.length} / {room.settings.numberOfTeams})
              </h2>
            </div>
          </div>

          <div className="space-y-3">
            {room.teams.map((team) => (
              <TeamLobbyCard
                key={team.id}
                team={team}
                isHost={isHost}
                onRemove={() => { void webSocketService.send({ type: "KICK_MEMBER", payload: { roomCode, targetTeamId: team.id } }).catch(e => useAuctionStore.setState({ bidErrorNotice: e.message })); }}
              />
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <AuctionSettingsSummary settings={room.settings} />
        </div>
      </div>
    </div>
  );
}

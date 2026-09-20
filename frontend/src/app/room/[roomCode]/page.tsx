"use client";

import React, { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useRoomStore } from "@/stores/room.store";
import { useAuthStore } from "@/stores/auth.store";
import { webSocketService } from "@/services/websocket.service";
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

  const { room, isHost, isLoading, error, fetchRoom } = useRoomStore();
  const { user } = useAuthStore();

  useEffect(() => {
    fetchRoom(roomCode, user?.id ?? undefined);
  }, [roomCode, user, fetchRoom]);

  /**
   * Start the auction via WebSocket START_AUCTION command.
   * The backend broadcasts AUCTION_STARTED + ROOM_STATE to all subscribers.
   * On receiving it we navigate everyone to the live auction page.
   */
  const handleStartAuction = () => {
    // Connect WS so we're subscribed before issuing the command
    webSocketService.connect(roomCode);

    const unsub = webSocketService.subscribe((event) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = event as any;
      const isStarted = e.type === "AUCTION_STARTED";
      const isRunningState =
        e.type === "ROOM_STATE" &&
        (e.payload?.status === "RUNNING" || e.status === "LIVE");

      if (isStarted || isRunningState) {
        unsub();
        webSocketService.disconnect();
        router.push(`/auction/${roomCode}`);
      }
    });

    // Small delay to let JOIN_ROOM complete before START_AUCTION
    setTimeout(() => {
      webSocketService.startAuction(roomCode);
    }, 300);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <ErrorState
          title="Room Not Found"
          message={error || `Unable to connect to room "${roomCode}".`}
          onRetry={() => fetchRoom(roomCode, user?.id ?? undefined)}
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
        connected={true}
      />

      <HostControls
        isHost={isHost}
        totalTeams={room.teams.length}
        expectedTeams={room.settings.numberOfTeams}
        onStartAuction={handleStartAuction}
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
                onRemove={() => {}}
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

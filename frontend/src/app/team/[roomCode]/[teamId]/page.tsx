"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { auctionService } from "@/services/auction.service";
import { Player, Team } from "@/types";
import { SquadFormationView } from "@/components/team/SquadFormationView";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { ArrowLeft } from "lucide-react";

export default function TeamSquadPage({
  params,
}: {
  params: Promise<{ roomCode: string; teamId: string }>;
}) {
  const resolvedParams = use(params);
  const roomCode = resolvedParams.roomCode.toUpperCase();
  const teamId = resolvedParams.teamId;

  const [team, setTeam] = useState<Team | null>(null);
  const [squad, setSquad] = useState<Player[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSquad() {
      try {
        const data = await auctionService.getTeamSquad(roomCode, teamId);
        setTeam(data.team);
        setSquad(data.squad);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Unable to load data.");
      } finally {
        setIsLoading(false);
      }
    }
    loadSquad();
  }, [roomCode, teamId]);

  if (loadError) return <div className="p-12"><ErrorState message={loadError} onRetry={() => window.location.reload()} /></div>;
  if (isLoading || !team) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      {/* Return navigation link */}
      <div className="flex items-center justify-between">
        <Link href={`/results/${roomCode}`}>
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Back to Results
          </Button>
        </Link>
        <span className="font-mono text-xs text-[#64748b]">Room: {roomCode}</span>
      </div>

      <SquadFormationView team={team} squad={squad} roomCode={roomCode} />
    </div>
  );
}

"use client";

import {ResultManagerAction} from '@/components/manager-mode/ManagerSetup';
import React, { useEffect, useState, use } from "react";
import { auctionService } from "@/services/auction.service";
import { AuctionAnalytics, Team } from "@/types";
import { ResultSummary } from "@/components/results/ResultSummary";
import { TeamResultCard } from "@/components/results/TeamResultCard";
import { TransferTable } from "@/components/results/TransferTable";
import { AuctionHighlights } from "@/components/results/AuctionHighlights";
import { Tabs } from "@/components/ui/Tabs";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { formatCr } from "@/lib/utils";

export default function ResultsPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const resolvedParams = use(params);
  const roomCode = resolvedParams.roomCode.toUpperCase();

  const [analytics, setAnalytics] = useState<AuctionAnalytics | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadResults() {
      try {
        const [resultsData, teamsData] = await Promise.all([
          auctionService.getResultsAnalytics(roomCode),
          auctionService.getTeams(roomCode),
        ]);
        setAnalytics(resultsData);
        setTeams(teamsData);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Unable to load data.");
      } finally {
        setIsLoading(false);
      }
    }
    loadResults();
  }, [roomCode]);

  if (loadError) return <div className="p-12"><ErrorState message={loadError} onRetry={() => window.location.reload()} /></div>;
  if (isLoading || !analytics) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const tabItems = [
    { id: "overview", label: "Overview" },
    { id: "teams", label: "Teams", count: teams.length },
    { id: "transfers", label: "All Transfers", count: analytics.transfers.length },
    { id: "unsold", label: "Unsold Players", count: analytics.unsoldList.length },
    { id: "highlights", label: "Analytics & Highlights" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
      {/* Top Banner and Summary */}
      <ResultSummary analytics={analytics} teams={teams} />
      <ResultManagerAction code={roomCode}/>

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-[#242c3d] pb-3 overflow-x-auto">
        <Tabs
          tabs={tabItems}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* Tab Contents */}
      {activeTab === "overview" && (
        <div className="space-y-8">
          <AuctionHighlights analytics={analytics} />

          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">
              FRANCHISE RESULTS SUMMARY
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {teams.map((team) => (
                <TeamResultCard
                  key={team.id}
                  team={team}
                  roomCode={roomCode}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "teams" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => (
            <TeamResultCard key={team.id} team={team} roomCode={roomCode} />
          ))}
        </div>
      )}

      {activeTab === "transfers" && (
        <TransferTable transfers={analytics.transfers} />
      )}

      {activeTab === "unsold" && (
        <div className="rounded-2xl bg-[#0e121a] border border-[#242c3d] p-6 shadow-lg">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#f8fafc] mb-4">
            UNSOLD / RECALL PLAYER ROSTER ({analytics.unsoldList.length})
          </h3>
          {analytics.unsoldList.length === 0 ? (
            <p className="text-xs text-[#64748b]">No unsold players in this auction.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {analytics.unsoldList.map((p) => (
                <div
                  key={p.id}
                  className="p-3 rounded-xl bg-[#151a24] border border-[#242c3d] flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="position" position={p.position} size="sm">
                      {p.ovr}
                    </Badge>
                    <div>
                      <p className="font-bold text-[#f8fafc]">{p.name}</p>
                      <p className="text-[10px] text-[#64748b]">{p.club}</p>
                    </div>
                  </div>
                  <span className="font-mono text-[#64748b]">
                    Base: {formatCr(p.basePrice)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "highlights" && (
        <AuctionHighlights analytics={analytics} />
      )}
    </div>
  );
}

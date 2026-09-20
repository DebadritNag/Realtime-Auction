"use client";

import React, { useEffect, use, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuctionStore } from "@/stores/auction.store";
import { useAuthStore } from "@/stores/auth.store";
import { useUIStore } from "@/stores/ui.store";
import { useConnectionStore } from "@/stores/connection.store";
import { auctionService } from "@/services/auction.service";
import type { Player } from "@/types";

import { BudgetTicker } from "@/components/auction/BudgetTicker";
import { PlayerPoolSidebar } from "@/components/auction/PlayerPoolSidebar";
import { PlayerAuctionCard } from "@/components/auction/PlayerAuctionCard";
import { CurrentBid } from "@/components/auction/CurrentBid";
import { AuctionTimer } from "@/components/auction/AuctionTimer";
import { AuctionControls } from "@/components/auction/AuctionControls";
import { TeamPanel } from "@/components/auction/TeamPanel";
import { TeamQuickView } from "@/components/auction/TeamQuickView";
import { AISuggestionPanel } from "@/components/auction/AISuggestionPanel";
import { HostAuctionControls } from "@/components/auction/HostAuctionControls";
import { SoldOverlay } from "@/components/auction/SoldOverlay";
import { UnsoldOverlay } from "@/components/auction/UnsoldOverlay";
import { ConnectionStatus } from "@/components/auction/ConnectionStatus";
import { BidFeed } from "@/components/auction/BidFeed";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";

import { Layers, Users, Bot } from "lucide-react";

export default function LiveAuctionPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const resolvedParams = use(params);
  const roomCode = resolvedParams.roomCode.toUpperCase();

  const { user } = useAuthStore();
  const { status: connectionStatus, latencyMs, initConnectionListener } = useConnectionStore();

  // Determine host status from auction store (authoritative from ROOM_STATE)
  const hostUserId = useAuctionStore((state) => state.hostUserId);
  const isHost = !!user && user.id === hostUserId;

  // Navigate to results when auction completes
  const auctionStatus = useAuctionStore((state) => state.auctionStatus);
  const router = useRouter();
  React.useEffect(() => {
    if (auctionStatus === "COMPLETED") {
      setTimeout(() => {
        router.push(`/results/${roomCode}`);
      }, 2000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionStatus]);

  // Auction Store selectors
  const activePlayer = useAuctionStore((state) => state.activePlayer);
  const currentBid = useAuctionStore((state) => state.currentBid);
  const highestBidder = useAuctionStore((state) => state.highestBidder);
  const endsAt = useAuctionStore((state) => state.endsAt);
  const serverTimeOffset = useAuctionStore((state) => state.serverTimeOffset);
  const minimumNextBid = useAuctionStore((state) => state.minimumNextBid);
  const currentPot = useAuctionStore((state) => state.currentPot);
  const teams = useAuctionStore((state) => state.teams);
  const recentBids = useAuctionStore((state) => state.recentBids);
  const aiSuggestion = useAuctionStore((state) => state.aiSuggestion);
  // auctionStatus already declared above for the completed-redirect effect
  const soldOverlay = useAuctionStore((state) => state.soldOverlay);
  const unsoldOverlay = useAuctionStore((state) => state.unsoldOverlay);
  const antiSnipingNotice = useAuctionStore((state) => state.antiSnipingNotice);
  const bidErrorNotice = useAuctionStore((state) => state.bidErrorNotice);

  const initAuction = useAuctionStore((state) => state.initAuction);
  const leaveAuction = useAuctionStore((state) => state.leaveAuction);
  const placeBid = useAuctionStore((state) => state.placeBid);
  const hostPause = useAuctionStore((state) => state.hostPause);
  const hostResume = useAuctionStore((state) => state.hostResume);
  const hostSkip = useAuctionStore((state) => state.hostSkip);
  const hostEnd = useAuctionStore((state) => state.hostEnd);
  const clearBidError = useAuctionStore((state) => state.clearBidError);
  const dismissSoldOverlay = useAuctionStore((state) => state.dismissSoldOverlay);
  const dismissUnsoldOverlay = useAuctionStore((state) => state.dismissUnsoldOverlay);

  // UI Store
  const {
    isTeamQuickViewOpen,
    selectedTeamId,
    closeTeamQuickView,
    isMobilePlayerDrawerOpen,
    isMobileTeamDrawerOpen,
    isMobileAIDrawerOpen,
    setMobilePlayerDrawer,
    setMobileTeamDrawer,
    setMobileAIDrawer,
  } = useUIStore();

  const [playerPool, setPlayerPool] = useState<Player[]>([]);

  useEffect(() => {
    // 1. Connect the WebSocket — webSocketService.connect() calls joinRoom internally on open
    initAuction(roomCode);
    // webSocketService.connect() is called inside initAuction → the service
    // sends JOIN_ROOM after the socket opens, then ROOM_STATE flows back.

    const unsubConn = initConnectionListener();

    // 2. Fetch the player pool for the sidebar from REST (non-live data)
    auctionService.getPlayerPool(roomCode).then((players) => {
      setPlayerPool(players);
    });

    // 3. Poll for AI recommendation whenever the active player changes
    let recTimer: ReturnType<typeof setInterval> | null = null;
    recTimer = setInterval(async () => {
      const { activePlayer } = useAuctionStore.getState();
      if (activePlayer) {
        const suggestion = await auctionService.getRecommendation(roomCode);
        if (suggestion) {
          useAuctionStore.setState({ aiSuggestion: suggestion });
        }
      }
    }, 15_000); // refresh recommendation every 15 s

    return () => {
      unsubConn();
      leaveAuction();
      if (recTimer) clearInterval(recTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  const userTeam = teams.find((t) => t.isCurrentUser || t.managerId === user?.id) || teams[0];
  const userBudget = userTeam ? userTeam.budgetRemaining : 150;
  const isUserLeading =
    highestBidder && (highestBidder.id === userTeam?.id || highestBidder.isCurrentUser);

  const selectedQuickViewTeam =
    teams.find((t) => t.id === selectedTeamId) || null;

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col bg-[#07090d] text-[#f8fafc] relative overflow-x-hidden">
      {/* 1. TOP STICKY BUDGET TICKER */}
      <BudgetTicker teams={teams} currentTeamId={userTeam?.id} />

      {/* Subheader with room code, status, and mobile drawer buttons */}
      <div className="w-full bg-[#0b0e14] border-b border-[#242c3d] px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-black text-[#00ff87]">
            {roomCode}
          </span>
          <span className="text-xs text-[#64748b] hidden sm:inline">•</span>
          <span className="text-xs text-[#94a3b8] hidden sm:inline">
            Pot: <strong className="uppercase text-[#f8fafc]">{currentPot}</strong>
          </span>
        </div>

        {/* Mobile / Tablet Triggers for Drawers */}
        <div className="flex lg:hidden items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMobilePlayerDrawer(true)}
            leftIcon={<Layers className="w-3.5 h-3.5 text-[#00ff87]" />}
          >
            Players
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMobileTeamDrawer(true)}
            leftIcon={<Users className="w-3.5 h-3.5 text-sky-400" />}
          >
            Teams
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMobileAIDrawer(true)}
            leftIcon={<Bot className="w-3.5 h-3.5 text-purple-400" />}
          >
            AI
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <ConnectionStatus status={connectionStatus} latencyMs={latencyMs} />
        </div>
      </div>

      {/* Host Bar if current user is room host */}
      {isHost && (
        <div className="px-4 py-1.5 bg-[#080a0f] border-b border-[#242c3d]">
          <HostAuctionControls
            isPaused={auctionStatus === "PAUSED"}
            onPause={hostPause}
            onResume={hostResume}
            onSkip={hostSkip}
            onEnd={hostEnd}
          />
        </div>
      )}

      {/* 2. MAIN 3-COLUMN AUCTION LAYOUT */}
      <div className="flex-1 max-w-[1600px] w-full mx-auto p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: Pot / Player Pool Sidebar (Hidden on mobile/tablet, available via Drawer) */}
        <div className="hidden lg:block lg:col-span-3 h-[calc(100vh-10rem)] sticky top-28">
          <PlayerPoolSidebar
            players={playerPool}
            activePlayerId={activePlayer?.id}
            currentPot={currentPot}
          />
        </div>

        {/* CENTER COLUMN: Player Card & Live Auction Console */}
        <div className="lg:col-span-6 space-y-4 max-w-xl mx-auto w-full">
          {/* Player Card */}
          <PlayerAuctionCard player={activePlayer} />

          {/* Current Bid & Timer in 2-column on center */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CurrentBid
              currentBid={currentBid}
              highestBidder={highestBidder}
              currentTeamId={userTeam?.id}
            />

            <AuctionTimer
              endsAt={endsAt}
              serverTimeOffset={serverTimeOffset}
              isPaused={auctionStatus === "PAUSED"}
            />
          </div>

          {/* Bid Button & Custom Controls */}
          <AuctionControls
            minimumNextBid={minimumNextBid}
            currentBid={currentBid}
            userBudgetRemaining={userBudget}
            isUserLeading={!!isUserLeading}
            isPaused={auctionStatus === "PAUSED"}
            onPlaceBid={placeBid}
            antiSnipingNotice={antiSnipingNotice}
            bidErrorNotice={bidErrorNotice}
            onClearError={clearBidError}
          />

          {/* Live Recent Bids Feed */}
          <BidFeed bids={recentBids} />
        </div>

        {/* RIGHT COLUMN: Teams & AI Assistant (Hidden on mobile/tablet, available via Drawer) */}
        <div className="hidden lg:flex lg:col-span-3 flex-col gap-4 h-[calc(100vh-10rem)] sticky top-28">
          <div className="flex-1 overflow-hidden min-h-[300px]">
            <TeamPanel teams={teams} currentTeamId={userTeam?.id} />
          </div>

          <div className="shrink-0">
            <AISuggestionPanel suggestion={aiSuggestion} />
          </div>
        </div>
      </div>

      {/* 3. DRAWERS & MODALS FOR RESPONSIVE EXPERIENCE */}

      {/* Team Quick View Drawer */}
      <TeamQuickView
        isOpen={isTeamQuickViewOpen}
        onClose={closeTeamQuickView}
        team={selectedQuickViewTeam}
        roomCode={roomCode}
      />

      {/* Mobile Players Drawer */}
      <Drawer
        isOpen={isMobilePlayerDrawerOpen}
        onClose={() => setMobilePlayerDrawer(false)}
        position="bottom"
        title="POT & PLAYER POOL"
      >
        <div className="h-[60vh]">
          <PlayerPoolSidebar
            players={playerPool}
            activePlayerId={activePlayer?.id}
            currentPot={currentPot}
          />
        </div>
      </Drawer>

      {/* Mobile Teams Drawer */}
      <Drawer
        isOpen={isMobileTeamDrawerOpen}
        onClose={() => setMobileTeamDrawer(false)}
        position="bottom"
        title="FRANCHISE PURSES & ROSTERS"
      >
        <div className="h-[60vh]">
          <TeamPanel teams={teams} currentTeamId={userTeam?.id} />
        </div>
      </Drawer>

      {/* Mobile AI Assistant Drawer */}
      <Drawer
        isOpen={isMobileAIDrawerOpen}
        onClose={() => setMobileAIDrawer(false)}
        position="bottom"
        title="AI AUCTION VALUATION"
      >
        <div className="p-2">
          <AISuggestionPanel suggestion={aiSuggestion} />
        </div>
      </Drawer>

      {/* 4. OVERLAYS */}
      <SoldOverlay soldData={soldOverlay} onDismiss={dismissSoldOverlay} />
      <UnsoldOverlay unsoldData={unsoldOverlay} onDismiss={dismissUnsoldOverlay} />
    </div>
  );
}
